// https://itempicker.atlagaming.eu/about-api#item-icon
const ITEMPICKER_ITEM_ICON_BASE = "https://itempicker.atlagaming.eu/api/items/icon";

function resolveItemVNum(itemOrListing) {
  if (!itemOrListing) return null;

  const nested = itemOrListing.item;
  const source = nested && typeof nested === "object" ? nested : itemOrListing;
  const vnum = source.itemVNum ?? itemOrListing.itemVNum;
  if (vnum == null || vnum === "") return null;

  const parsed = Number(vnum);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function itemIconUrl(itemOrListing) {
  const vnum = resolveItemVNum(itemOrListing);
  if (vnum == null) return null;
  return `${ITEMPICKER_ITEM_ICON_BASE}/${vnum}`;
}

window.ItemIcons = {
  ITEMPICKER_ITEM_ICON_BASE,
  resolveItemVNum,
  itemIconUrl,
};
