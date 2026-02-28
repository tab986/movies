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
const STOPWORDS = new Set(["the", "of", "and", "for", "to"]);

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

function isMeaningfulToken(token) {
  if (!token) return false;
  if (STOPWORDS.has(token)) return false;
  if (/^\d+$/.test(token)) return true; // keep years / numbered sequels
  if (/^[ivxlcdm]+$/i.test(token)) return true; // keep roman numerals like v, vi
  return token.length >= 2;
}

function buildSearchDescriptor(rawQuery) {
  const normalized = normalizeText(rawQuery);
  if (!normalized) return null;

  const expanded = expandAliases(normalized);
  const queryVariants = unique([expanded, normalized]);
  const rawTokens = unique(
    normalized
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length >= 1)
  );
  const expandedTokens = unique(
    expanded
      .split(" ")
      .map((t) => t.trim())
      .filter(isMeaningfulToken)
  );
  const tokens = unique([
    ...expandedTokens,
    ...rawTokens.filter(isMeaningfulToken),
  ]);
  const initialsVariants = unique(queryVariants.map(initialsFromText));

  return { queryVariants, tokens, rawTokens, expandedTokens, initialsVariants };
}

function buildInitialsSql(searchNameSql) {
  return `(
    regexp_replace(
      regexp_replace(
        ${searchNameSql},
        '[^a-z0-9]+',
        ' ',
        'g'
      ),
      '(^|\\s+)([a-z0-9])[a-z0-9]*',
      '\\2',
      'g'
    )
  )`;
}

function buildInitialsExpr(searchDescriptor, initialsSql) {
  const variants = searchDescriptor.initialsVariants || [];
  if (!variants.length) return "0";
  const checks = variants.map(
    (initials) => `CASE WHEN ${initialsSql} LIKE '${escapeSqlLiteral(initials)}%' THEN 1 ELSE 0 END`
  );
  return `GREATEST(${checks.join(", ")})`;
}

function buildTokenCoverageExpr(searchDescriptor, searchNameSql) {
  const tokens = searchDescriptor.tokens || [];
  if (!tokens.length) return "0";
  const checks = tokens.map(
    (token) => `CASE WHEN ${searchNameSql} LIKE '%${escapeSqlLiteral(token)}%' THEN 1 ELSE 0 END`
  );
  return `((${checks.join(" + ")})::double precision / ${tokens.length})`;
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

function buildPhraseExpr(searchDescriptor, searchNameSql) {
  const variants = searchDescriptor.queryVariants || [];
  if (!variants.length) return "0";
  const checks = variants.map(
    (variant) => `CASE WHEN ${searchNameSql} LIKE '%${escapeSqlLiteral(variant)}%' THEN 1 ELSE 0 END`
  );
  return `GREATEST(${checks.join(", ")})`;
}

function buildAllTokensExpr(searchDescriptor, searchNameSql) {
  const tokens = (searchDescriptor.expandedTokens && searchDescriptor.expandedTokens.length
    ? searchDescriptor.expandedTokens
    : searchDescriptor.tokens) || [];
  if (!tokens.length) return "0";
  const tokenHits = tokens.map(
    (token) => `CASE WHEN ${searchNameSql} LIKE '%${escapeSqlLiteral(token)}%' THEN 1 ELSE 0 END`
  );
  return `CASE WHEN (${tokenHits.join(" + ")}) >= ${tokens.length} THEN 1 ELSE 0 END`;
}

function buildContainsExpr(searchDescriptor, searchNameSql) {
  const phraseExpr = buildPhraseExpr(searchDescriptor, searchNameSql);
  const allTokensExpr = buildAllTokensExpr(searchDescriptor, searchNameSql);
  return `GREATEST((${phraseExpr}), (${allTokensExpr}))`;
}

function buildSearchFilterSql(searchDescriptor, searchNameSql) {
  const phraseExpr = buildPhraseExpr(searchDescriptor, searchNameSql);
  const allTokensExpr = buildAllTokensExpr(searchDescriptor, searchNameSql);
  const containsExpr = buildContainsExpr(searchDescriptor, searchNameSql);
  const initialsExpr = buildInitialsExpr(searchDescriptor, buildInitialsSql(searchNameSql));
  const queryVariants = searchDescriptor.queryVariants || [];
  const fastPhraseChecks = queryVariants.length
    ? queryVariants.map(
        (variant) =>
          `${searchNameSql} LIKE '%${escapeSqlLiteral(variant)}%'`
      )
    : ["FALSE"];
  const fastInitialsChecks = (searchDescriptor.initialsVariants || []).length
    ? (searchDescriptor.initialsVariants || []).map(
        (initials) =>
          `${buildInitialsSql(searchNameSql)} LIKE '${escapeSqlLiteral(initials)}%'`
      )
    : ["FALSE"];
  const fastFilterExpr = `(${[...fastPhraseChecks, ...fastInitialsChecks].join(" OR ")})`;
  return `(
    (${fastFilterExpr}) AND (
      (${containsExpr}) = 1 OR
      (${initialsExpr}) = 1 OR
      ((${phraseExpr}) = 1) OR
      ((${allTokensExpr}) = 1)
    )
  )`;
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

function maxCondition(matchExpressions) {
  if (!matchExpressions.length) return 0;
  if (matchExpressions.length === 1) return matchExpressions[0];
  return { $max: matchExpressions };
}

function buildSearchBaseFields() {
  const searchNameExpr = {
    $toLower: {
      $ifNull: [
        "$overrides.name",
        {
          $ifNull: ["$remote.name", "$remote.originalName"],
        },
      ],
    },
  };

  return {
    _searchName: searchNameExpr,
    _searchInitials: {
      $reduce: {
        input: {
          $filter: {
            input: { $split: [searchNameExpr, " "] },
            as: "token",
            cond: { $ne: ["$$token", ""] },
          },
        },
        initialValue: "",
        in: { $concat: ["$$value", { $substrCP: ["$$this", 0, 1] }] },
      },
    },
    metacriticNorm: {
      $divide: [{ $min: [{ $max: [{ $ifNull: ["$remote.metacriticScore", 0] }, 0] }, 100] }, 100],
    },
    qtyNorm: {
      $divide: [{ $min: [{ $max: [{ $ifNull: ["$remote.qty", 0] }, 0] }, 100] }, 100],
    },
    offersNorm: {
      $divide: [{ $min: [{ $size: { $ifNull: ["$remote.offers", []] } }, 20] }, 20],
    },
    discountNorm: {
      $divide: [{ $min: [{ $max: [{ $ifNull: ["$officialStore.cut", 0] }, 0] }, 100] }, 100],
    },
    releaseDateParsed: {
      $dateFromString: {
        dateString: "$remote.releaseDate",
        onError: null,
        onNull: null,
      },
    },
  };
}

function buildRelevanceFields(searchDescriptor) {
  const phraseMatchers = searchDescriptor.queryVariants.map((variant) => {
    const phraseRegex = escapeRegex(variant).replace(/\s+/g, "\\s+");
    return {
      $cond: [
        {
          $regexMatch: {
            input: "$_searchName",
            regex: `\\b${phraseRegex}\\b`,
            options: "i",
          },
        },
        1,
        0,
      ],
    };
  });

  const coverageTokens =
    searchDescriptor.expandedTokens?.length > 0
      ? searchDescriptor.expandedTokens
      : searchDescriptor.tokens;

  const tokenMatchers = coverageTokens.map((token) => ({
    $cond: [
      {
        $regexMatch: {
          input: "$_searchName",
          regex: `\\b${escapeRegex(token)}\\b`,
          options: "i",
        },
      },
      1,
      0,
    ],
  }));

  const rawTokenMatchers = searchDescriptor.rawTokens.map((token) => ({
    $cond: [
      {
        $regexMatch: {
          input: "$_searchName",
          regex: `\\b${escapeRegex(token)}\\b`,
          options: "i",
        },
      },
      1,
      0,
    ],
  }));

  const initialsMatchers = searchDescriptor.initialsVariants.map((initials) => ({
    $cond: [
      {
        $regexMatch: {
          input: "$_searchInitials",
          regex: `^${escapeRegex(initials)}`,
          options: "i",
        },
      },
      1,
      0,
    ],
  }));

  const tokenMatchCountExpr = tokenMatchers.length ? { $add: tokenMatchers } : 0;
  const tokenCoverageExpr = coverageTokens.length
    ? { $divide: [tokenMatchCountExpr, coverageTokens.length] }
    : 0;
  const orderedTokenRegex = coverageTokens.length
    ? coverageTokens.map((token) => `\\b${escapeRegex(token)}\\b`).join(".*")
    : null;
  const rawTokenHitExpr = rawTokenMatchers.length ? { $add: rawTokenMatchers } : 0;
  const containsPriorityExpr = {
    $cond: [
      {
        $or: [
          { $gt: [maxCondition(phraseMatchers), 0] },
          { $gt: [rawTokenHitExpr, 0] },
          { $gt: [tokenMatchCountExpr, 0] },
        ],
      },
      1,
      0,
    ],
  };
  const initialsPriorityExpr = {
    $cond: [{ $gt: [maxCondition(initialsMatchers), 0] }, 1, 0],
  };

  return {
    exactPhraseMatch: maxCondition(phraseMatchers),
    tokenMatchCount: tokenMatchCountExpr,
    tokenCoverage: tokenCoverageExpr,
    initialsMatch: maxCondition(initialsMatchers),
    containsPriority: containsPriorityExpr,
    initialsPriority: initialsPriorityExpr,
    orderBonus: orderedTokenRegex
      ? {
          $cond: [
            {
              $regexMatch: {
                input: "$_searchName",
                regex: orderedTokenRegex,
                options: "i",
              },
            },
            1,
            0,
          ],
        }
      : 0,
    relevanceScore: {
      $add: [
        { $multiply: [{ $ifNull: [maxCondition(phraseMatchers), 0] }, 4] },
        { $multiply: [{ $ifNull: [tokenCoverageExpr, 0] }, 2.5] },
        { $multiply: [{ $ifNull: [maxCondition(initialsMatchers), 0] }, 2] },
        { $multiply: [{ $ifNull: [orderedTokenRegex ? { $cond: [{ $regexMatch: { input: "$_searchName", regex: orderedTokenRegex, options: "i" } }, 1, 0] } : 0, 0] }, 0.5] },
      ],
    },
  };
}

function buildPopularityFields() {
  const releaseRecencyNormExpr = {
    $max: [
      0,
      {
        $subtract: [
          1,
          {
            $divide: [
              {
                $min: [
                  3650,
                  {
                    $max: [
                      0,
                      {
                        $cond: [
                          { $ifNull: ["$releaseDateParsed", false] },
                          { $divide: [{ $subtract: ["$$NOW", "$releaseDateParsed"] }, 86400000] },
                          3650,
                        ],
                      },
                    ],
                  },
                ],
              },
              3650,
            ],
          },
        ],
      },
    ],
  };

  return {
    releaseRecencyNorm: releaseRecencyNormExpr,
    popularityScore: {
      $add: [
        { $multiply: [{ $ifNull: ["$metacriticNorm", 0] }, 0.45] },
        { $multiply: [{ $ifNull: ["$qtyNorm", 0] }, 0.2] },
        { $multiply: [{ $ifNull: ["$offersNorm", 0] }, 0.15] },
        { $multiply: [{ $ifNull: ["$discountNorm", 0] }, 0.1] },
        { $multiply: [releaseRecencyNormExpr, 0.1] },
      ],
    },
  };
}

function buildSearchPipelines({ where, searchDescriptor, sort, skip, limit }) {
  if (!searchDescriptor) return null;

  const base = [
    { $match: where },
    { $addFields: buildSearchBaseFields() },
    { $addFields: buildRelevanceFields(searchDescriptor) },
    { $addFields: buildPopularityFields() },
    {
      $match: {
        $or: [{ containsPriority: 1 }, { initialsPriority: 1 }],
      },
    },
  ];

  const sortStage = {
    containsPriority: -1,
    initialsPriority: -1,
    popularityScore: -1,
    relevanceScore: -1,
    ...sort,
    _id: 1,
  };

  return {
    dataPipeline: [...base, { $sort: sortStage }, { $skip: skip }, { $limit: limit }],
    countPipeline: [...base, { $count: "count" }],
  };
}

module.exports = {
  buildSearchDescriptor,
  buildSearchFilterSql,
  buildSearchRankSql,
  buildSearchPipelines,
};
