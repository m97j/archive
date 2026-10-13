const legacyNames = new Set(["_prisma_migrations", "Post", "Tag", "TagonPost", "TagOnPost"]);
const guardedFunctions = new Set([
  "archive_prevent_immutable_history_mutation",
  "archive_guard_content_revision",
  "archive_guard_localized_revision",
]);

export function legacyInventory(inventory) {
  return inventory
    .filter((table) => table.schema === "public" && legacyNames.has(table.name))
    .map(({ schema, name, rows, sha256 }) => ({ schema, name, rows, sha256 }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
}

/** Additive releases must retain the exact rows of every pre-existing public table. */
export function existingApplicationRowsPreserved(before, after) {
  const expected = before.filter((table) => table.schema === "public");
  return expected.every((table) => {
    const current = after.find(
      (candidate) => candidate.schema === table.schema && candidate.name === table.name,
    );
    return current?.rows === table.rows && current?.sha256 === table.sha256;
  });
}

export function fixedFunctionSearchPaths(rows) {
  return (
    rows.length === guardedFunctions.size &&
    new Set(rows.map((row) => row.proname)).size === guardedFunctions.size &&
    rows.every(
      (row) =>
        guardedFunctions.has(row.proname) &&
        Array.isArray(row.proconfig) &&
        row.proconfig.includes('search_path=""'),
    )
  );
}
