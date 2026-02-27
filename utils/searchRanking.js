function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_MAP = {
  gta: "grand theft auto",
  rdr: "red dead redemption",
  cod: "call of duty",
  gow: "god of war",
  tlou: "the last of us",
  pubg: "playerunknowns battlegrounds",
};

function expandAliases(text) {
  let expanded = text;
  for (const [alias, canonical] of Object.entries(ALIAS_MAP)) {
    expanded = expanded.replace(new RegExp(`\\b${escapeRegex(alias)}\\b`, "g"), canonical);
  }
  return normalizeText(expanded);
}

function initialsFromText(text) {
  return String(text || "")
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0])
    .join("");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildSearchDescriptor(rawQuery) {
  const normalized = normalizeText(rawQuery);
  if (!normalized) return null;

  const expanded = expandAliases(normalized);
  const queryVariants = unique([normalized, expanded]);
  const tokens = unique(
    queryVariants
      .flatMap((v) => v.split(" "))
      .map((t) => t.trim())
      .filter(Boolean)
  );
  const initialsVariants = unique(queryVariants.map(initialsFromText));

  return { normalized, queryVariants, tokens, initialsVariants };
}

function buildSearchNameSql() {
  return `LOWER(COALESCE("overrides"->>'name', "remote"->>'name', "remote"->>'originalName', ''))`;
}

function buildInitialsSql(searchNameSql) {
  return `(
    SELECT STRING_AGG(LEFT(word, 1), '' ORDER BY ord)
    FROM UNNEST(REGEXP_SPLIT_TO_ARRAY(${searchNameSql}, '\\s+')) WITH ORDINALITY AS t(word, ord)
    WHERE word <> ''
  )`;
}

function buildContainsExpr(searchDescriptor, searchNameSql) {
  const checks = [];
  for (const variant of searchDescriptor.queryVariants) {
    checks.push(`CASE WHEN ${searchNameSql} LIKE '%${escapeSqlLiteral(variant)}%' THEN 1 ELSE 0 END`);
  }
  for (const token of searchDescriptor.tokens) {
    checks.push(`CASE WHEN ${searchNameSql} LIKE '%${escapeSqlLiteral(token)}%' THEN 1 ELSE 0 END`);
  }
  if (!checks.length) return "0";
  return `GREATEST(${checks.join(", ")})`;
}

function buildTokenCoverageExpr(searchDescriptor, searchNameSql) {
  if (!searchDescriptor.tokens.length) return "0";
  const checks = searchDescriptor.tokens.map(
    (token) => `CASE WHEN ${searchNameSql} LIKE '%${escapeSqlLiteral(token)}%' THEN 1 ELSE 0 END`
  );
  return `((${checks.join(" + ")})::double precision / ${searchDescriptor.tokens.length})`;
}

function buildInitialsExpr(searchDescriptor, initialsSql) {
  if (!searchDescriptor.initialsVariants.length) return "0";
  const checks = searchDescriptor.initialsVariants.map(
    (initials) => `CASE WHEN ${initialsSql} LIKE '${escapeSqlLiteral(initials)}%' THEN 1 ELSE 0 END`
  );
  return `GREATEST(${checks.join(", ")})`;
}

function buildPopularityExpr() {
  const metacriticNorm = `LEAST(100, GREATEST(0, COALESCE(NULLIF("remote"->>'metacriticScore', '')::double precision, 0))) / 100.0`;
  const qtyNorm = `LEAST(100, GREATEST(0, COALESCE(NULLIF("remote"->>'qty', '')::double precision, 0))) / 100.0`;
  const offersNorm = `LEAST(20, COALESCE(JSONB_ARRAY_LENGTH(COALESCE("remote"->'offers', '[]'::jsonb)), 0)) / 20.0`;
  const discountNorm = `LEAST(100, GREATEST(0, COALESCE(NULLIF("officialStore"->>'cut', '')::double precision, 0))) / 100.0`;
  const releaseRecencyNorm = `GREATEST(
    0,
    1 - LEAST(
      3650,
      COALESCE(
        EXTRACT(EPOCH FROM (NOW() - TO_DATE(NULLIF("remote"->>'releaseDate', ''), 'YYYY-MM-DD'))) / 86400,
        3650
      )
    ) / 3650.0
  )`;

  return `(
    (${metacriticNorm}) * 0.45 +
    (${qtyNorm}) * 0.20 +
    (${offersNorm}) * 0.15 +
    (${discountNorm}) * 0.10 +
    (${releaseRecencyNorm}) * 0.10
  )`;
}

function buildSearchFilterSql(searchDescriptor, searchNameSql) {
  const containsExpr = buildContainsExpr(searchDescriptor, searchNameSql);
  const initialsExpr = buildInitialsExpr(searchDescriptor, buildInitialsSql(searchNameSql));
  return `((${containsExpr}) = 1 OR (${initialsExpr}) = 1)`;
}

function buildSearchRankSql(searchDescriptor, searchNameSql) {
  const initialsSql = buildInitialsSql(searchNameSql);
  const containsExpr = buildContainsExpr(searchDescriptor, searchNameSql);
  const tokenCoverageExpr = buildTokenCoverageExpr(searchDescriptor, searchNameSql);
  const initialsExpr = buildInitialsExpr(searchDescriptor, initialsSql);
  const popularityExpr = buildPopularityExpr();

  return {
    containsExpr,
    initialsExpr,
    relevanceExpr: `((${containsExpr}) * 10 + (${tokenCoverageExpr}) * 3 + (${initialsExpr}) * 2)`,
    popularityExpr,
  };
}

module.exports = {
  buildSearchDescriptor,
  buildSearchNameSql,
  buildSearchFilterSql,
  buildSearchRankSql,
};
