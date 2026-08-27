// إضافة هذه الدوال إلى TradeService class

/**
 * Get user's trade history with pagination
 */
async getTradeHistory(userId, filters = {}) {
    const { limit = 50, offset = 0, status, startDate, endDate } = filters;
    
    let query = { userId };
    if (status) query.status = status;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    let trades;
    let totalCount;
    
    if (process.env.DB_TYPE === 'mongodb') {
        const queryBuilder = Trade.find(query);
        totalCount = await Trade.countDocuments(query);
        
        trades = await queryBuilder
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(offset));
    } else {
        const { Op } = require('sequelize');
        const whereClause = { userId };
        
        if (status) whereClause.status = status;
        if (startDate || endDate) {
            whereClause.createdAt = {};
            if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
            if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
        }
        
        const result = await Trade.findAndCountAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
        trades = result.rows;
        totalCount = result.count;
    }
    
    return {
        trades: trades.map(trade => ({
            id: trade.id,
            symbol: trade.symbol,
            direction: trade.direction,
            amount: trade.amount,
            entryPrice: trade.entryPrice,
            exitPrice: trade.exitPrice,
            duration: trade.duration,
            status: trade.status,
            profitLoss: trade.profitLoss,
            createdAt: trade.createdAt,
            expirationTime: trade.expirationTime
        })),
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset)
    };
}

/**
 * Get trade summary statistics
 */
async getTradeSummary(userId) {
    let totalTrades, winTrades, lossTrades, totalProfitLoss;
    
    if (process.env.DB_TYPE === 'mongodb') {
        totalTrades = await Trade.countDocuments({ userId });
        winTrades = await Trade.countDocuments({ userId, status: 'WIN' });
        lossTrades = await Trade.countDocuments({ userId, status: 'LOSS' });
        
        const result = await Trade.aggregate([
            { $match: { userId, status: { $in: ['WIN', 'LOSS'] } } },
            { $group: { 
                _id: null, 
                total: { $sum: '$profitLoss' },
                avgProfit: { $avg: '$profitLoss' },
                maxProfit: { $max: '$profitLoss' },
                minProfit: { $min: '$profitLoss' }
            } }
        ]);
        
        totalProfitLoss = result.length > 0 ? result[0].total : 0;
        const avgProfit = result.length > 0 ? result[0].avgProfit : 0;
        const maxProfit = result.length > 0 ? result[0].maxProfit : 0;
        const minProfit = result.length > 0 ? result[0].minProfit : 0;
        
        return {
            totalTrades,
            winTrades,
            lossTrades,
            pendingTrades: totalTrades - winTrades - lossTrades,
            winRate: totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0,
            totalProfitLoss,
            avgProfit,
            maxProfit,
            minProfit
        };
    } else {
        const { Op } = require('sequelize');
        totalTrades = await Trade.count({ where: { userId } });
        winTrades = await Trade.count({ where: { userId, status: 'WIN' } });
        lossTrades = await Trade.count({ where: { userId, status: 'LOSS' } });
        
        const result = await Trade.findAll({
            where: { userId, status: { [Op.in]: ['WIN', 'LOSS'] } },
            attributes: [
                [sequelize.fn('SUM', sequelize.col('profitLoss')), 'total'],
                [sequelize.fn('AVG', sequelize.col('profitLoss')), 'avg'],
                [sequelize.fn('MAX', sequelize.col('profitLoss')), 'max'],
                [sequelize.fn('MIN', sequelize.col('profitLoss')), 'min']
            ]
        });
        
        const stats = result[0]?.dataValues || {};
        
        return {
            totalTrades,
            winTrades,
            lossTrades,
            pendingTrades: totalTrades - winTrades - lossTrades,
            winRate: totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0,
            totalProfitLoss: stats.total || 0,
            avgProfit: stats.avg || 0,
            maxProfit: stats.max || 0,
            minProfit: stats.min || 0
        };
    }
              }
