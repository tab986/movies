/**
 * Compute merchant line discount (IQD) for one cart line.
 * @param {number} baseUnitPriceIQD
 * @param {number} quantity
 * @param {{ status: string, discountActive: boolean, discountType: string|null, discountValue: number|null }} merchant
 * @returns {{ discountAmount: number, discountType: string|null, discountValue: number|null }}
 */
function computeMerchantLineDiscount(baseUnitPriceIQD, quantity, merchant) {
  const lineSubtotal =
    (Number(baseUnitPriceIQD) || 0) * (Number(quantity) || 0);
  if (
    !merchant ||
    merchant.status !== "active" ||
    !merchant.discountActive ||
    !merchant.discountType ||
    merchant.discountValue == null ||
    lineSubtotal <= 0
  ) {
    return { discountAmount: 0, discountType: null, discountValue: null };
  }

  const type = String(merchant.discountType).toLowerCase();
  const rawVal = Number(merchant.discountValue);
  if (!Number.isFinite(rawVal) || rawVal <= 0) {
    return { discountAmount: 0, discountType: null, discountValue: null };
  }

  let discountAmount = 0;
  if (type === "percent") {
    if (rawVal > 100) {
      return { discountAmount: 0, discountType: null, discountValue: null };
    }
    discountAmount = (lineSubtotal * rawVal) / 100;
  } else if (type === "fixed") {
    // Fixed IQD off the line total (not per unit)
    discountAmount = Math.min(lineSubtotal, rawVal);
  } else {
    return { discountAmount: 0, discountType: null, discountValue: null };
  }

  discountAmount = Math.max(0, Math.min(lineSubtotal, discountAmount));
  return {
    discountAmount,
    discountType: type,
    discountValue: rawVal,
  };
}

module.exports = { computeMerchantLineDiscount };
