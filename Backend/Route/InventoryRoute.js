const express = require("express");
const router = express.Router();
const {
  getAllInventory,
  addInventoryItem,
  getInventoryById,
  updateInventoryItem,
  deleteInventoryItem,
  updateStockQuantity,
  getInventoryStats,
  generatePDFReport,
  initializeSampleData,
  syncProductToBranch,
  addProductAndSyncToBranch
} = require("../Controllers/InventoryController");

// GET all inventory items
router.get("/", getAllInventory);

// GET initialize sample data
router.get("/init", initializeSampleData);

// POST add new inventory item
router.post("/", addInventoryItem);

// GET inventory item by ID
router.get("/:id", getInventoryById);

// PUT update inventory item
router.put("/:id", updateInventoryItem);

// DELETE inventory item
router.delete("/:id", deleteInventoryItem);

// POST update stock quantity
router.post("/:id/stock", updateStockQuantity);

// GET inventory statistics
router.get("/stats/overview", getInventoryStats);

// GET generate PDF report
router.get("/report/pdf", generatePDFReport);

// POST sync product to branch inventory
router.post("/sync-to-branch", syncProductToBranch);

// POST add product and sync to branch in one operation
router.post("/add-and-sync", addProductAndSyncToBranch);

module.exports = router;
