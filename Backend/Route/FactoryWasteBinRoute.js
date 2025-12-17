const express = require('express');
const router = express.Router();
const {
  getMainFactoryBin,
  addWasteToFactoryBin,
  emptyFactoryBin,
  getFactoryBinStatistics,
  getFactoryBinHistory,
  migrateHistoricalWaste
} = require('../Controllers/FactoryWasteBinController');

// Get or create the main factory waste bin
router.get('/', getMainFactoryBin);

// Get factory bin statistics
router.get('/statistics', getFactoryBinStatistics);

// Get factory bin waste history with optional filters
router.get('/history', getFactoryBinHistory);

// Add waste to the factory bin
router.post('/add-waste', addWasteToFactoryBin);

// Empty the factory bin
router.put('/empty', emptyFactoryBin);

// Migrate historical waste data to factory bin
router.post('/migrate-historical', migrateHistoricalWaste);

module.exports = router;
