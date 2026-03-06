const couponCode = require('coupon-code-generator');
const { Coupon } = require('../post-models');
async function generateCouponCode( ) {
    let code = null;
    let isUnique = false;
    // Keep generating until a unique code is found in the database
    do {
        code = couponCode.generate({ parts: 3, partLen: 4 }); // e.g., 'ABCD-EFGH-IJKL'
        const existingCoupon = await Coupon.findOne({ where: { code } });
        if (!existingCoupon) {
            isUnique = true;
        }
    } while (!isUnique);
    return code;
}

async function applyCoupon(code, cartValue) {
    const canonicalCode = couponCode.validate(code);
    if (!canonicalCode) {
        throw new Error('Invalid coupon code format');
    }

    const amount = Number(cartValue);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('Invalid cart value');
    }

    try {
        const coupon = await Coupon.findOne({ where: { code: canonicalCode } });
        if (!coupon) {
            throw new Error('Coupon not found');
        }
        if (!coupon.active) {
            throw new Error('Coupon is inactive');
        }
        if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
            throw new Error('Coupon is expired');
        }

        const couponValue = Number(coupon.value);
        if (!Number.isFinite(couponValue) || couponValue <= 0) {
            throw new Error('Coupon value is invalid');
        }

        let discountAmount;
        if (coupon.type === 'fixed') {
            discountAmount = couponValue;
        } else if (coupon.type === 'percent') {
            discountAmount = (amount * couponValue) / 100;
        } else {
            throw new Error('Coupon type is invalid');
        }

        if (!Number.isFinite(discountAmount)) {
            throw new Error('Failed to calculate discount');
        }

        return Math.max(0, Math.min(amount, discountAmount));
    } catch (err) {
        throw err;
    }
}

async function createCoupon( type, value, expiresAt) {
    const code = await generateCouponCode();
    const coupon = await Coupon.create({ code:code, type, value, expiresAt });
    return coupon;
}

async function deleteCoupon(code) {
    await Coupon.destroy({ where: { code } });
}








module.exports = {  deleteCoupon, createCoupon , applyCoupon };