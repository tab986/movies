// routes/coupons.js (example using Express Router)
const express = require('express');
const router = express.Router();
const { createCoupon, deleteCoupon , applyCoupon } = require('../utils/coupon.js');
const { Coupon } = require('../post-models');
const couponCode = require('coupon-code-generator');


// Route to create a new coupon (Admin access required in a real system)
// it needs the type, value, and expiresAt in the body of the request
router.post('/create', async (req, res) => {
    try {
     const newCoupon =   await createCoupon(req.body.type, req.body.value, req.body.expiresAt);
        res.status(201).json(newCoupon);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Route to delete a coupon
router.delete('/delete', async (req, res) => {
    try {
        await deleteCoupon(req.body.code);
        res.status(200).json({ message: 'Coupon deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Route to validate and apply a coupon
router.post('/apply', async (req, res) => {
    try {
        const { code, cartValue, userId: bodyUserId } = req.body;
        const userId = req.user?._id || req.user?.id || bodyUserId;
        const parsedCartValue = Number(cartValue);
        if (!code || String(code).trim() === '') {
            return res.status(400).json({ status: 'fail', message: 'Coupon code is required' });
        }
        if (!userId || String(userId).trim() === '') {
            return res.status(400).json({ status: 'fail', message: 'userId is required' });
        }
        if (!Number.isFinite(parsedCartValue) || parsedCartValue < 0) {
            return res.status(400).json({ status: 'fail', message: 'cartValue must be a valid non-negative number' });
        }

        const couponResult = await applyCoupon(code, parsedCartValue, userId);
        const discountAmount = Number(couponResult?.discount) || 0;
        const newCartValue = Math.max(0, parsedCartValue - discountAmount);
        res.status(200).json({
            status: 'success',
            message: 'Coupon applied successfully',
            couponCode: couponResult?.code,
            discountAmount,
            newCartValue
        });

    } catch (err) {
        res.status(400).json({ status: 'fail', message: err.message || 'Failed to apply coupon' });
    }
});

const getCouponByCanonicalCode = async (req, res) => {
    const canonicalCode = couponCode.validate(req.params.code);
    if (!canonicalCode) {
        res.status(400).json({ status: 'fail', message: 'Invalid coupon code format' });
        return null;
    }

    const coupon = await Coupon.findOne({ where: { code: canonicalCode } });
    if (!coupon) {
        res.status(404).json({ status: 'fail', message: 'Coupon not found' });
        return null;
    }

    return coupon;
};

router.get('/:code/users', async (req, res) => {
    try {
        const coupon = await getCouponByCanonicalCode(req, res);
        if (!coupon) return;

        const users = Array.isArray(coupon.users) ? coupon.users : [];
        res.status(200).json({
            status: 'success',
            users
        });
    } catch (err) {
        res.status(500).json({ status: 'fail', message: err.message || 'Failed to fetch coupon users' });
    }
});

router.get('/:code/users/count', async (req, res) => {
    try {
        const coupon = await getCouponByCanonicalCode(req, res);
        if (!coupon) return;

        const users = Array.isArray(coupon.users) ? coupon.users : [];
        res.status(200).json({
            status: 'success',
            count: users.length
        });
    } catch (err) {
        res.status(500).json({ status: 'fail', message: err.message || 'Failed to fetch coupon user count' });
    }
});

module.exports = router;
