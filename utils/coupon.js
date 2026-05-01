const couponCode = require('coupon-code');
const { fn, col, where } = require('sequelize');
const { Coupon } = require('../post-models');

const normalizeCouponCode = (rawCode) => String(rawCode || '').trim().toUpperCase();
const normalizeUserId = (rawUserId) => String(rawUserId || '').trim();

function buildUsageMap(coupon) {
    const usageFromMap = coupon?.userUsageByUserId && typeof coupon.userUsageByUserId === 'object'
        ? { ...coupon.userUsageByUserId }
        : {};
    const legacyUsers = Array.isArray(coupon?.users) ? coupon.users : [];

    for (const legacyUserId of legacyUsers) {
        const normalizedLegacyUserId = normalizeUserId(legacyUserId);
        if (!normalizedLegacyUserId) continue;
        if (!Number.isFinite(Number(usageFromMap[normalizedLegacyUserId]))) {
            usageFromMap[normalizedLegacyUserId] = 1;
        }
    }

    return usageFromMap;
}

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
    const normalizedUserId = normalizeUserId(userId);
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
        const usageMap = buildUsageMap(coupon);
        const currentUserUsage = Number(usageMap[normalizedUserId] || 0);
        const maxUsesPerUser = Math.max(1, Number(coupon.maxUsesPerUser) || 1);
        if (currentUserUsage >= maxUsesPerUser) {
            throw new Error('Coupon usage limit reached for this user');
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

async function createCoupon(type, value, expiresAt, codName, maxUsesPerUser) {
    const customCode = normalizeCouponCode(codName);
    const code = customCode || await generateCouponCode();
    const existingCoupon = await Coupon.findOne({ where: { code } });
    if (existingCoupon) {
        throw new Error('Coupon code already exists');
    }
    const parsedMaxUsesPerUser = maxUsesPerUser == null ? 1 : Number(maxUsesPerUser);
    if (!Number.isInteger(parsedMaxUsesPerUser) || parsedMaxUsesPerUser < 1) {
        throw new Error('maxUsesPerUser must be an integer greater than or equal to 1');
    }
    const coupon = await Coupon.create({
        code: code,
        type,
        value,
        expiresAt,
        maxUsesPerUser: parsedMaxUsesPerUser
    });
    return coupon;
}

async function deleteCoupon(code) {
    await Coupon.destroy({ where: { code } });
}








module.exports = {
    deleteCoupon,
    createCoupon,
    applyCoupon,
    buildUsageMap
};