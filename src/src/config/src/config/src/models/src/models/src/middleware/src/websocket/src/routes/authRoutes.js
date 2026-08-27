const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);

// Protected routes
router.get('/profile', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.put('/password', authController.changePassword);

module.exports = router;
