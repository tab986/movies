// routes/coupons.js (example using Express Router)
const express = require('express');
const router = express.Router();
const { createCoupon, deleteCoupon , applyCoupon } = require('../utils/coupon.js');


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
        const { code, cartValue } = req.body;
        const parsedCartValue = Number(cartValue);
        if (!code || String(code).trim() === '') {
            return res.status(400).json({ status: 'fail', message: 'Coupon code is required' });
        }
        if (!Number.isFinite(parsedCartValue) || parsedCartValue < 0) {
            return res.status(400).json({ status: 'fail', message: 'cartValue must be a valid non-negative number' });
        }

        const discountAmount = await applyCoupon(code, parsedCartValue);
        const newCartValue = Math.max(0, parsedCartValue - discountAmount);
        res.status(200).json({
            status: 'success',
            message: 'Coupon applied successfully',
            discountAmount,
            newCartValue
        });

    } catch (err) {
        res.status(400).json({ status: 'fail', message: err.message || 'Failed to apply coupon' });
    }
});

module.exports = router;
