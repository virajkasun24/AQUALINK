const FactoryWasteBin = require('../Model/FactoryWasteBinModel');

// Get or create the main factory waste bin
const getMainFactoryBin = async (req, res) => {
  try {
    const mainBin = await FactoryWasteBin.getMainBin();
    const statistics = mainBin.getStatistics();
    
    res.status(200).json({
      success: true,
      bin: mainBin,
      statistics: statistics
    });
  } catch (error) {
    console.error('Error getting main factory bin:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting main factory bin',
      error: error.message
    });
  }
};

// Add waste to the factory bin
const addWasteToFactoryBin = async (req, res) => {
  try {
    const { sourceBranch, sourceBranchId, wasteWeight, wasteType, collectionRequestId, processedBy } = req.body;
    
    // Validate required fields
    if (!sourceBranch || !sourceBranchId || !wasteWeight || !wasteType || !collectionRequestId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sourceBranch, sourceBranchId, wasteWeight, wasteType, collectionRequestId'
      });
    }
    
    const mainBin = await FactoryWasteBin.getMainBin();
    
    // Add waste to the bin
    await mainBin.addWaste({
      sourceBranch,
      sourceBranchId,
      wasteWeight,
      wasteType,
      collectionRequestId,
      processedBy: processedBy || req.user?.name || 'Unknown'
    });
    
    const updatedBin = await FactoryWasteBin.getMainBin();
    const statistics = updatedBin.getStatistics();
    
    res.status(200).json({
      success: true,
      message: 'Waste added to factory bin successfully',
      bin: updatedBin,
      statistics: statistics
    });
  } catch (error) {
    console.error('Error adding waste to factory bin:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding waste to factory bin',
      error: error.message
    });
  }
};

// Empty the factory bin
const emptyFactoryBin = async (req, res) => {
  try {
    const mainBin = await FactoryWasteBin.getMainBin();
    const processedBy = req.user?.name || 'Unknown';
    
    await mainBin.emptyBin(processedBy);
    
    const updatedBin = await FactoryWasteBin.getMainBin();
    const statistics = updatedBin.getStatistics();
    
    res.status(200).json({
      success: true,
      message: 'Factory bin emptied successfully',
      bin: updatedBin,
      statistics: statistics
    });
  } catch (error) {
    console.error('Error emptying factory bin:', error);
    res.status(500).json({
      success: false,
      message: 'Error emptying factory bin',
      error: error.message
    });
  }
};

// Get factory bin statistics
const getFactoryBinStatistics = async (req, res) => {
  try {
    const mainBin = await FactoryWasteBin.getMainBin();
    const statistics = mainBin.getStatistics();
    
    res.status(200).json({
      success: true,
      statistics: statistics
    });
  } catch (error) {
    console.error('Error getting factory bin statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting factory bin statistics',
      error: error.message
    });
  }
};

// Get factory bin waste history
const getFactoryBinHistory = async (req, res) => {
  try {
    const { page = 1, limit = 50, branchId, wasteType, startDate, endDate } = req.query;
    
    const mainBin = await FactoryWasteBin.getMainBin();
    let history = mainBin.wasteHistory;
    
    // Apply filters
    if (branchId) {
      history = history.filter(entry => entry.sourceBranchId === branchId);
    }
    
    if (wasteType) {
      history = history.filter(entry => entry.wasteType === wasteType);
    }
    
    if (startDate) {
      history = history.filter(entry => entry.date >= new Date(startDate));
    }
    
    if (endDate) {
      history = history.filter(entry => entry.date <= new Date(endDate));
    }
    
    // Sort by date (newest first)
    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedHistory = history.slice(startIndex, endIndex);
    
    res.status(200).json({
      success: true,
      history: paginatedHistory,
      totalCount: history.length,
      currentPage: parseInt(page),
      totalPages: Math.ceil(history.length / limit)
    });
  } catch (error) {
    console.error('Error getting factory bin history:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting factory bin history',
      error: error.message
    });
  }
};

// Migrate historical waste data to factory bin
const migrateHistoricalWaste = async (req, res) => {
  try {
    const RecyclingRequest = require('../Model/RecyclingRequestModel');
    const Branch = require('../Model/BranchModel');
    
    // Get all completed recycling requests
    const completedRequests = await RecyclingRequest.find({ 
      status: { $in: ['Completed', 'Approved'] },
      wasteWeight: { $exists: true, $gt: 0 }
    }).populate('branchId', 'name');
    
    const mainBin = await FactoryWasteBin.getMainBin();
    let migratedCount = 0;
    let totalWeight = 0;
    
    for (const request of completedRequests) {
      try {
        await mainBin.addWaste({
          sourceBranch: request.branchId?.name || 'Unknown Branch',
          sourceBranchId: request.branchId?._id?.toString() || 'unknown',
          wasteWeight: request.wasteWeight || 0,
          wasteType: request.wasteType || 'Mixed',
          collectionRequestId: request._id.toString(),
          processedBy: 'Historical Migration'
        });
        
        migratedCount++;
        totalWeight += request.wasteWeight || 0;
      } catch (error) {
        console.error(`Error migrating request ${request._id}:`, error);
      }
    }
    
    const updatedBin = await FactoryWasteBin.getMainBin();
    const statistics = updatedBin.getStatistics();
    
    res.status(200).json({
      success: true,
      message: `Historical waste migration completed`,
      migratedCount,
      totalWeight,
      bin: updatedBin,
      statistics: statistics
    });
  } catch (error) {
    console.error('Error migrating historical waste:', error);
    res.status(500).json({
      success: false,
      message: 'Error migrating historical waste',
      error: error.message
    });
  }
};

module.exports = {
  getMainFactoryBin,
  addWasteToFactoryBin,
  emptyFactoryBin,
  getFactoryBinStatistics,
  getFactoryBinHistory,
  migrateHistoricalWaste
};
