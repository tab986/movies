const couponCode = require('coupon-code');
const { fn, col, where } = require('sequelize');
const { Coupon } = require('../post-models');

const normalizeCouponCode = (rawCode) => String(rawCode || '').trim().toUpperCase();

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

async function applyCoupon(code, cartValue, userId) {
    const canonicalCode = normalizeCouponCode(code);
    if (!canonicalCode) {
        throw new Error('Coupon code is required');
    }

    const amount = Number(cartValue);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('Invalid cart value');
    }
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
        throw new Error('Invalid user id');
    }

    try {
        const coupon = await Coupon.findOne({
            where: where(fn('UPPER', col('code')), canonicalCode)
        });
        if (!coupon) {
            throw new Error('Coupon not found');
        }
        if (!coupon.active) {
            throw new Error('Coupon is inactive');
        }
        if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
            throw new Error('Coupon is expired');
        }
        const usedUsers = Array.isArray(coupon.users) ? coupon.users : [];
        const hasUsedCoupon = usedUsers.some((usedUserId) => String(usedUserId) === normalizedUserId);
        if (hasUsedCoupon) {
            throw new Error('Coupon already used by this user');
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

        const discount = Math.max(0, Math.min(amount, discountAmount));
        return {
            code: canonicalCode,
            discount,
        };
    } catch (err) {
        throw err;
    }
}

async function createCoupon(type, value, expiresAt, codName) {
    const customCode = normalizeCouponCode(codName);
    const code = customCode || await generateCouponCode();
    const existingCoupon = await Coupon.findOne({ where: { code } });
    if (existingCoupon) {
        throw new Error('Coupon code already exists');
    }
    const coupon = await Coupon.create({ code:code, type, value, expiresAt });
    return coupon;
}

async function deleteCoupon(code) {
    await Coupon.destroy({ where: { code } });
}








module.exports = {  deleteCoupon, createCoupon , applyCoupon };