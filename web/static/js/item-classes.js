// NosTale class bitmask labels (itempicker / in-game item tooltips).
// Bit order: ADV (1), WAR (2), ARC (4), MAG (8), M.A (16).
const ITEM_CLASS_BITS = [
  { bit: 1, abbr: "ADV", flag: "isAdventurer", name: "Adventurer" },
  { bit: 2, abbr: "WAR", flag: "isSwordsman", name: "Swordsman" },
  { bit: 4, abbr: "ARC", flag: "isArcher", name: "Archer" },
  { bit: 8, abbr: "MAG", flag: "isMage", name: "Mage" },
  { bit: 16, abbr: "M.A", flag: "isMartialArtist", name: "Martial Artist" },
];

function itemClassAbbreviations(item) {
  if (!item) return [];

  const mask = item.classMask;
  if (mask === 0) {
    return ITEM_CLASS_BITS.map((entry) => entry.abbr);
  }
  if (typeof mask === "number" && mask > 0) {
    return ITEM_CLASS_BITS.filter((entry) => mask & entry.bit).map((entry) => entry.abbr);
  }

  return ITEM_CLASS_BITS.filter((entry) => item[entry.flag]).map((entry) => entry.abbr);
}

function formatItemClassLine(item) {
  const abbreviations = itemClassAbbreviations(item);
  if (!abbreviations.length) return null;
  return abbreviations.join("");
}

window.ItemClasses = {
  ITEM_CLASS_BITS,
  itemClassAbbreviations,
  formatItemClassLine,
};
