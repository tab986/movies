function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      .filter((t) => t.length >= 1)
  );
  const tokens = unique([...expandedTokens, ...rawTokens]);
  const initialsVariants = unique(queryVariants.map(initialsFromText));

  return { queryVariants, tokens, rawTokens, expandedTokens, initialsVariants };
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

module.exports = { buildSearchDescriptor, buildSearchPipelines };
