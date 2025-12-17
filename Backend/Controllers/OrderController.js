const Order = require("../Model/OrderModel");
const Inventory = require("../Model/InventoryModel");

// GET: Display all orders
const getAllOrders = async (req, res, next) => {
  try {
    const orders = await Order.find().sort({ orderDate: -1 });
    return res.status(200).json({ orders });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET: Get pending orders only
const getPendingOrders = async (req, res, next) => {
  try {
    const pendingOrders = await Order.find({ 
      status: { $in: ['Pending', 'Processing'] } 
    }).sort({ priority: -1, orderDate: 1 }).limit(10);
    return res.status(200).json({ orders: pendingOrders });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST: Add a new order
const addOrder = async (req, res, next) => {
  const { 
    branchName, 
    branchLocation, 
    items, 
    expectedDeliveryDate, 
    priority, 
    notes, 
    contactPerson, 
    contactPhone 
  } = req.body;

  try {
    // Basic validation
    if (!branchName || !branchLocation || !items || !expectedDeliveryDate || !contactPerson || !contactPhone) {
      return res.status(400).json({ 
        message: "All required fields must be provided" 
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        message: "At least one item must be specified" 
      });
    }

    // Validate items against inventory
    const validationErrors = [];
    for (const item of items) {
      if (!item.itemName || !item.quantity) {
        validationErrors.push(`Item ${item.itemName || 'Unknown'} is missing required fields`);
        continue;
      }

      const inventoryItem = await Inventory.findOne({ name: item.itemName });
      if (!inventoryItem) {
        validationErrors.push(`Item "${item.itemName}" not found in inventory. Please add it to inventory first.`);
        continue;
      }

      const requestedQuantity = parseInt(item.quantity);
      if (isNaN(requestedQuantity) || requestedQuantity <= 0) {
        validationErrors.push(`Invalid quantity for ${item.itemName}: must be a positive number`);
        continue;
      }

      if (inventoryItem.quantity < requestedQuantity) {
        validationErrors.push(`Insufficient stock for ${item.itemName}. Available: ${inventoryItem.quantity}, Requested: ${requestedQuantity}`);
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: "Validation failed",
        errors: validationErrors
      });
    }

    const newOrder = new Order({
      branchName,
      branchLocation,
      items: items.map(item => ({
        ...item,
        quantity: parseInt(item.quantity)
      })),
      expectedDeliveryDate,
      priority,
      notes,
      contactPerson,
      contactPhone
    });

    await newOrder.save();
    return res.status(201).json({ order: newOrder });
  } catch (err) {
    console.error('Error adding order:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: Object.values(err.errors).map(e => e.message)
      });
    }
    return res.status(500).json({ message: "Unable to add order" });
  }
};

// GET: Get order by ID
const getOrderById = async (req, res, next) => {
  const id = req.params.id;

  try {
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    return res.status(200).json({ order });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching order" });
  }
};

// PUT: Update order status
const updateOrderStatus = async (req, res, next) => {
  const id = req.params.id;
  const { status } = req.body;

  try {
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    let inventoryUpdates = [];

    // If status is being changed to "Shipped", reduce factory inventory
    if (status === 'Shipped' && 
        (order.status === 'Pending' || order.status === 'Processing')) {
      
      for (const item of order.items) {
        const inventoryItem = await Inventory.findOne({ name: item.itemName });
        if (inventoryItem) {
          // Check if we have enough stock
          if (inventoryItem.quantity < item.quantity) {
            return res.status(400).json({ 
              message: `Insufficient stock for ${item.itemName}. Available: ${inventoryItem.quantity}, Required: ${item.quantity}` 
            });
          }
          
          inventoryItem.quantity -= item.quantity;
          await inventoryItem.save();
          
          inventoryUpdates.push({
            itemName: item.itemName,
            quantityReduced: item.quantity,
            newFactoryQuantity: inventoryItem.quantity,
            status: inventoryItem.status
          });
        }
      }
    }

    // If status is being changed to "Delivered", update branch inventory
    if (status === 'Delivered' && order.status === 'Shipped') {
      console.log(`🔄 Factory marking order ${order._id} as delivered, updating branch inventory`);
      
      const BranchInventory = require("../Model/BranchInventoryModel");
      
      // Get branch ID from the order
      let branchId = order.branchId;
      
      // If branchId is not available, fall back to mapping (for existing orders)
      if (!branchId) {
        console.log(`⚠️ No branchId found in order, using branch name mapping for ${order.branchName}`);
        const branchMapping = {
          'Galle Branch': 'BR003',
          'Colombo Branch': 'BR001',
          'Kandy Branch': 'BR002'
        };
        branchId = branchMapping[order.branchName] || 'BR003'; // Default to Galle Branch
      }
      
      console.log(`📦 Updating branch inventory for branch ${branchId} with ${order.items.length} items`);
      
      for (const item of order.items) {
        try {
          console.log(`📦 Processing item: ${item.itemName} (${item.quantity} units) for branch ${branchId}`);
          
          // Get factory inventory item to get additional details
          const factoryItem = await Inventory.findOne({ name: item.itemName });
          
          // Update branch inventory with enhanced data
          const updateData = {
            $inc: { quantity: item.quantity },
            lastUpdated: new Date()
          };

          // If this is a new item in branch inventory, set additional properties
          if (factoryItem) {
            updateData.unit = factoryItem.unit || 'pieces';
            updateData.minStockLevel = factoryItem.minStockLevel || 10;
            updateData.maxStockLevel = factoryItem.maxStockLevel || 100;
          }

          const updatedInventory = await BranchInventory.findOneAndUpdate(
            {
              branchId: branchId,
              name: item.itemName
            },
            {
              ...updateData,
              branchName: order.branchName || 'Unknown Branch'
            },
            { 
              upsert: true, 
              new: true,
              setDefaultsOnInsert: true
            }
          );

          if (updatedInventory) {
            console.log(`✅ Successfully updated branch inventory for ${item.itemName}: ${updatedInventory.quantity} units`);
            inventoryUpdates.push({
              itemName: item.itemName,
              quantityAdded: item.quantity,
              newTotalQuantity: updatedInventory.quantity,
              status: updatedInventory.status,
              unit: updatedInventory.unit,
              previousQuantity: updatedInventory.quantity - item.quantity
            });
          } else {
            console.error(`❌ Failed to update branch inventory for ${item.itemName}`);
          }
        } catch (itemError) {
          console.error(`❌ Error updating branch inventory for item ${item.itemName}:`, itemError);
          // Continue with other items even if one fails
        }
      }
      
      console.log(`📊 Total branch inventory updates: ${inventoryUpdates.length}`);
    }

    order.status = status;
    await order.save();

    // Sync status change to branch order if this is a branch request
    if (order.originalBranchOrderId) {
      const BranchOrder = require("../Model/BranchOrderModel");
      await BranchOrder.findByIdAndUpdate(order.originalBranchOrderId, {
        status: status
      });
    }

    return res.status(200).json({ 
      order,
      inventoryUpdates: inventoryUpdates.length > 0 ? inventoryUpdates : null
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// DELETE: Delete order
const deleteOrder = async (req, res, next) => {
  const id = req.params.id;

  try {
    const order = await Order.findByIdAndDelete(id);
    if (!order) {
      return res.status(404).json({ message: "Unable to delete order" });
    }
    return res.status(200).json({ order });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET: Get order statistics
const getOrderStats = async (req, res, next) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'Pending' });
    const processingOrders = await Order.countDocuments({ status: 'Processing' });
    const shippedOrders = await Order.countDocuments({ status: 'Shipped' });
    const deliveredOrders = await Order.countDocuments({ status: 'Delivered' });

    // Get orders by priority
    const urgentOrders = await Order.countDocuments({ priority: 'Urgent', status: { $in: ['Pending', 'Processing'] } });
    const highPriorityOrders = await Order.countDocuments({ priority: 'High', status: { $in: ['Pending', 'Processing'] } });

    return res.status(200).json({
      stats: {
        totalOrders,
        pendingOrders,
        processingOrders,
        shippedOrders,
        deliveredOrders,
        urgentOrders,
        highPriorityOrders
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching statistics" });
  }
};

// GET: Get recent activities
const getRecentActivities = async (req, res, next) => {
  try {
    const recentOrders = await Order.find()
      .sort({ orderDate: -1 })
      .limit(5)
      .select('orderNumber branchName status orderDate');

    const lowStockItems = await Inventory.find({ status: 'Low Stock' })
      .select('name quantity');

    const outOfStockItems = await Inventory.find({ status: 'Out of Stock' })
      .select('name');

    const activities = [];

    // Add order activities
    recentOrders.forEach(order => {
      activities.push({
        type: 'order',
        message: `New order ${order.orderNumber} received from ${order.branchName}`,
        timestamp: order.orderDate,
        status: order.status
      });
    });

    // Add inventory alerts
    lowStockItems.forEach(item => {
      activities.push({
        type: 'inventory',
        message: `Low stock alert: ${item.name} (${item.quantity} remaining)`,
        timestamp: new Date(),
        status: 'warning'
      });
    });

    outOfStockItems.forEach(item => {
      activities.push({
        type: 'inventory',
        message: `Out of stock: ${item.name}`,
        timestamp: new Date(),
        status: 'critical'
      });
    });

    // Sort by timestamp and return top 10
    activities.sort((a, b) => b.timestamp - a.timestamp);
    return res.status(200).json({ activities: activities.slice(0, 10) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching activities" });
  }
};

// GET: Get monthly production and orders data
const getMonthlyProductionOrders = async (req, res, next) => {
  try {
    // Get current year
    const currentYear = new Date().getFullYear();
    
    // Generate monthly data for the current year
    const monthlyData = [];
    
    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(currentYear, month, 1);
      const monthEnd = new Date(currentYear, month + 1, 0);
      
      // Get orders for this month
      const monthOrders = await Order.find({
        orderDate: {
          $gte: monthStart,
          $lte: monthEnd
        }
      });
      
      // Calculate total quantity ordered for this month
      const totalOrders = monthOrders.reduce((sum, order) => sum + order.totalQuantity, 0);
      
      // Calculate production (simulated - in real app this would come from production records)
      // For now, we'll simulate production as 80-120% of orders
      const productionMultiplier = 0.8 + Math.random() * 0.4; // Random between 0.8 and 1.2
      const production = Math.round(totalOrders * productionMultiplier);
      
      // Calculate recycling (simulated - in real app this would come from recycling records)
      // For now, we'll simulate recycling as 60-80% of production
      const recyclingMultiplier = 0.6 + Math.random() * 0.2; // Random between 0.6 and 0.8
      const recycling = Math.round(production * recyclingMultiplier);
      
      const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      
      monthlyData.push({
        month: monthNames[month],
        Production: production,
        Recycling: recycling,
        Orders: totalOrders
      });
    }
    
    return res.status(200).json({ data: monthlyData });
  } catch (err) {
    console.error('Error fetching monthly production orders data:', err);
    return res.status(500).json({ message: "Error fetching monthly data" });
  }
};

// Test endpoint to simulate factory delivery (temporary)
const testFactoryDelivery = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    
    console.log(`🧪 Testing factory delivery for order ${orderId} with status ${status}`);
    
    // Simulate the updateOrderStatus function
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    let inventoryUpdates = [];

    // If status is being changed to "Delivered", update branch inventory
    if (status === 'Delivered' && order.status === 'Shipped') {
      console.log(`🔄 Factory marking order ${order._id} as delivered, updating branch inventory`);
      
      const BranchInventory = require("../Model/BranchInventoryModel");
      
      // Get branch ID from the order
      let branchId = order.branchId;
      
      // If branchId is not available, fall back to mapping (for existing orders)
      if (!branchId) {
        console.log(`⚠️ No branchId found in order, using branch name mapping for ${order.branchName}`);
        const branchMapping = {
          'Galle Branch': 'BR003',
          'Colombo Branch': 'BR001',
          'Kandy Branch': 'BR002'
        };
        branchId = branchMapping[order.branchName] || 'BR003'; // Default to Galle Branch
      }
      
      console.log(`📦 Updating branch inventory for branch ${branchId} with ${order.items.length} items`);
      
      for (const item of order.items) {
        try {
          console.log(`📦 Processing item: ${item.itemName} (${item.quantity} units) for branch ${branchId}`);
          
          // Get factory inventory item to get additional details
          const factoryItem = await Inventory.findOne({ name: item.itemName });
          
          // Update branch inventory with enhanced data
          const updateData = {
            $inc: { quantity: item.quantity },
            lastUpdated: new Date()
          };

          // If this is a new item in branch inventory, set additional properties
          if (factoryItem) {
            updateData.unit = factoryItem.unit || 'pieces';
            updateData.minStockLevel = factoryItem.minStockLevel || 10;
            updateData.maxStockLevel = factoryItem.maxStockLevel || 100;
          }

          const updatedInventory = await BranchInventory.findOneAndUpdate(
            {
              branchId: branchId,
              name: item.itemName
            },
            {
              ...updateData,
              branchName: order.branchName || 'Unknown Branch'
            },
            { 
              upsert: true, 
              new: true,
              setDefaultsOnInsert: true
            }
          );

          if (updatedInventory) {
            console.log(`✅ Successfully updated branch inventory for ${item.itemName}: ${updatedInventory.quantity} units`);
            inventoryUpdates.push({
              itemName: item.itemName,
              quantityAdded: item.quantity,
              newTotalQuantity: updatedInventory.quantity,
              status: updatedInventory.status,
              unit: updatedInventory.unit,
              previousQuantity: updatedInventory.quantity - item.quantity
            });
          } else {
            console.error(`❌ Failed to update branch inventory for ${item.itemName}`);
          }
        } catch (itemError) {
          console.error(`❌ Error updating branch inventory for item ${item.itemName}:`, itemError);
          // Continue with other items even if one fails
        }
      }
      
      console.log(`📊 Total branch inventory updates: ${inventoryUpdates.length}`);
    }

    order.status = status;
    await order.save();

    // Sync status change to branch order if this is a branch request
    if (order.originalBranchOrderId) {
      const BranchOrder = require("../Model/BranchOrderModel");
      await BranchOrder.findByIdAndUpdate(order.originalBranchOrderId, {
        status: status
      });
    }

    return res.status(200).json({ 
      success: true,
      message: "Test delivery completed",
      order,
      inventoryUpdates: inventoryUpdates.length > 0 ? inventoryUpdates : null
    });
  } catch (err) {
    console.error('Test delivery error:', err);
    return res.status(500).json({ message: "Test delivery failed", error: err.message });
  }
};

// Accept order and allocate inventory
const acceptOrder = async (req, res, next) => {
  const id = req.params.id;

  try {
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if order can be accepted
    if (order.status !== 'Pending') {
      return res.status(400).json({ 
        message: `Order cannot be accepted. Current status: ${order.status}` 
      });
    }

    // Validate inventory availability
    const inventoryValidation = [];
    const inventoryUpdates = [];

    for (const item of order.items) {
      const inventoryItem = await Inventory.findOne({ name: item.itemName });
      
      if (!inventoryItem) {
        inventoryValidation.push(`Item "${item.itemName}" not found in factory inventory`);
        continue;
      }

      if (inventoryItem.quantity < item.quantity) {
        inventoryValidation.push(`Insufficient stock for ${item.itemName}. Available: ${inventoryItem.quantity}, Required: ${item.quantity}`);
        continue;
      }

      // Reserve inventory for this order
      inventoryItem.quantity -= item.quantity;
      await inventoryItem.save();

      inventoryUpdates.push({
        itemName: item.itemName,
        quantityReserved: item.quantity,
        newFactoryQuantity: inventoryItem.quantity,
        previousQuantity: inventoryItem.quantity + item.quantity,
        status: inventoryItem.status
      });
    }

    if (inventoryValidation.length > 0) {
      return res.status(400).json({ 
        message: "Cannot accept order due to inventory issues",
        errors: inventoryValidation
      });
    }

    // Update order status to 'Accepted'
    order.status = 'Accepted';
    order.acceptedDate = new Date();
    order.acceptedBy = req.user?.name || 'Factory Manager';
    await order.save();

    // If this is a branch request, also update the branch order status
    if (order.source === 'Branch Request' && order.originalBranchOrderId) {
      try {
        const BranchOrder = require("../Model/BranchOrderModel");
        await BranchOrder.findByIdAndUpdate(order.originalBranchOrderId, {
          status: 'Accepted',
          acceptedDate: new Date()
        });
        console.log(`✅ Branch order ${order.originalBranchOrderId} status updated to Accepted`);
      } catch (branchError) {
        console.error('⚠️ Warning: Could not update branch order status:', branchError);
      }
    }

    console.log(`✅ Order ${order._id} accepted successfully`);
    console.log(`📦 Inventory reserved: ${inventoryUpdates.length} items`);

    return res.status(200).json({ 
      message: "Order accepted successfully",
      order: order,
      inventoryUpdates: inventoryUpdates
    });

  } catch (err) {
    console.error('Error accepting order:', err);
    return res.status(500).json({ message: "Error accepting order" });
  }
};

exports.getAllOrders = getAllOrders;
exports.getPendingOrders = getPendingOrders;
exports.addOrder = addOrder;
exports.getOrderById = getOrderById;
exports.updateOrderStatus = updateOrderStatus;
exports.deleteOrder = deleteOrder;
exports.getOrderStats = getOrderStats;
exports.getRecentActivities = getRecentActivities;
exports.getMonthlyProductionOrders = getMonthlyProductionOrders;
exports.testFactoryDelivery = testFactoryDelivery;
exports.acceptOrder = acceptOrder;
