const Branch = require('../Model/BranchModel');
const User = require('../Model/UserModel');

// Create new branch
const createBranch = async (req, res) => {
  try {
    console.log('Received branch data:', req.body);
    
    const {
      name,
      location,
      address,
      phone,
      email,
      manager,
      capacity,
      currentStock,
      coordinates,
      status
    } = req.body;

    // Check if branch name already exists
    const existingBranch = await Branch.findOne({ name });
    if (existingBranch) {
      return res.status(400).json({
        success: false,
        message: 'Branch with this name already exists'
      });
    }

    // Create contactInfo object from individual fields
    const contactInfo = {
      phone: phone || '',
      email: email || '',
      address: address || ''
    };

    // Create branch data object
    const branchData = {
      name,
      location,
      managerName: manager || 'TBD', // Use manager name as string
      capacity: capacity || 0, // Keep as number
      currentStock: currentStock || 0, // Keep as number
      coordinates: coordinates || { lat: 0, lng: 0 },
      contactInfo,
      status: status || 'Active'
    };

    console.log('Creating branch with data:', branchData);

    const branch = new Branch(branchData);
    const savedBranch = await branch.save();
    
    console.log('Branch created successfully:', savedBranch);
    
    res.status(201).json({
      success: true,
      message: 'Branch created successfully',
      data: savedBranch
    });
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating branch',
      error: error.message
    });
  }
};

// Get all branches
const getAllBranches = async (req, res) => {
  try {
    const branches = await Branch.find()
      .populate('manager', 'name email phone')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      branches: branches
    });
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching branches',
      error: error.message
    });
  }
};

// Get branch by ID
const getBranchById = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id)
      .populate('manager', 'name email phone');

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    res.status(200).json({
      success: true,
      data: branch
    });
  } catch (error) {
    console.error('Error fetching branch:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching branch',
      error: error.message
    });
  }
};

// Update branch
const updateBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // If manager is being updated, verify it's a valid Branch Manager
    if (updateData.manager) {
      const managerUser = await User.findById(updateData.manager);
      if (!managerUser || managerUser.role !== 'Branch Manager') {
        return res.status(400).json({
          success: false,
          message: 'Manager must be a valid Branch Manager'
        });
      }
    }

    const updatedBranch = await Branch.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('manager', 'name email phone');

    if (!updatedBranch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Branch updated successfully',
      data: updatedBranch
    });
  } catch (error) {
    console.error('Error updating branch:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating branch',
      error: error.message
    });
  }
};

// Delete branch
const deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedBranch = await Branch.findByIdAndDelete(id);

    if (!deletedBranch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Branch deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting branch:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting branch',
      error: error.message
    });
  }
};

// Get branches by status
const getBranchesByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const branches = await Branch.find({ status })
      .populate('manager', 'name email phone')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: branches
    });
  } catch (error) {
    console.error('Error fetching branches by status:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching branches by status',
      error: error.message
    });
  }
};

// Update branch stock
const updateBranchStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentStock } = req.body;

    const updatedBranch = await Branch.findByIdAndUpdate(
      id,
      { currentStock },
      { new: true }
    ).populate('manager', 'name email phone');

    if (!updatedBranch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Branch stock updated successfully',
      data: updatedBranch
    });
  } catch (error) {
    console.error('Error updating branch stock:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating branch stock',
      error: error.message
    });
  }
};

// Get branches within radius
const getBranchesWithinRadius = async (req, res) => {
  try {
    const { lat, lng, radius = 50000 } = req.query; // radius in meters

    const branches = await Branch.find({
      status: 'Active',
      coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    }).populate('manager', 'name email phone');

    res.status(200).json({
      success: true,
      data: branches
    });
  } catch (error) {
    console.error('Error fetching branches within radius:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching branches within radius',
      error: error.message
    });
  }
};

// Get branch statistics
const getBranchStatistics = async (req, res) => {
  try {
    const totalBranches = await Branch.countDocuments();
    const activeBranches = await Branch.countDocuments({ status: 'Active' });
    const inactiveBranches = await Branch.countDocuments({ status: 'Inactive' });
    const maintenanceBranches = await Branch.countDocuments({ status: 'Maintenance' });

    // Calculate total capacity and stock
    const branches = await Branch.find();
    const totalCapacity = branches.reduce((sum, branch) => {
      return sum + parseInt(branch.capacity.replace('L', ''));
    }, 0);
    const totalStock = branches.reduce((sum, branch) => {
      return sum + parseInt(branch.currentStock.replace('L', ''));
    }, 0);

    const statistics = {
      totalBranches,
      activeBranches,
      inactiveBranches,
      maintenanceBranches,
      totalCapacity: `${totalCapacity}L`,
      totalStock: `${totalStock}L`,
      utilizationRate: totalCapacity > 0 ? ((totalStock / totalCapacity) * 100).toFixed(1) : 0
    };

    res.status(200).json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('Error fetching branch statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching branch statistics',
      error: error.message
    });
  }
};

module.exports = {
  createBranch,
  getAllBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  getBranchesByStatus,
  updateBranchStock,
  getBranchesWithinRadius,
  getBranchStatistics
};
