const mongoose = require('mongoose');

// MongoDB Schema
const tradeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  symbol: {
    type: String,
    required: [true, 'Symbol is required'],
    default: 'BTCUSDT'
  },
  direction: {
    type: String,
    enum: ['UP', 'DOWN'],
    required: [true, 'Trade direction is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [1, 'Minimum amount is $1'],
    max: [10000, 'Maximum amount is $10,000']
  },
  entryPrice: {
    type: Number,
    required: [true, 'Entry price is required'],
    min: [0, 'Price must be greater than 0']
  },
  exitPrice: {
    type: Number,
    default: null
  },
  duration: {
    type: Number, // Duration in seconds
    required: [true, 'Duration is required'],
    enum: [30, 60, 120, 300, 600], // 30s, 60s, 2min, 5min, 10min
    validate: {
      validator: function(value) {
        return [30, 60, 120, 300, 600].includes(value);
      },
      message: 'Invalid duration. Choose from: 30, 60, 120, 300, 600 seconds'
    }
  },
  expirationTime: {
    type: Date,
    required: [true, 'Expiration time is required']
  },
  status: {
    type: String,
    enum: ['PENDING', 'WIN', 'LOSS', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING'
  },
  profitLoss: {
    type: Number,
    default: 0
  },
  payoutMultiplier: {
    type: Number,
    default: 0.8 // 80% payout for winning trades
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
tradeSchema.index({ userId: 1, status: 1 });
tradeSchema.index({ expirationTime: 1, status: 1 });

// Update timestamps
tradeSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// PostgreSQL Model (Sequelize)
const initTradeModel = (sequelize, DataTypes) => {
  const Trade = sequelize.define('Trade', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    symbol: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'BTCUSDT'
    },
    direction: {
      type: DataTypes.ENUM('UP', 'DOWN'),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        min: 1,
        max: 10000
      }
    },
    entryPrice: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    },
    exitPrice: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: null
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isIn: [[30, 60, 120, 300, 600]]
      }
    },
    expirationTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'WIN', 'LOSS', 'EXPIRED', 'CANCELLED'),
      defaultValue: 'PENDING'
    },
    profitLoss: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0
    },
    payoutMultiplier: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.8
    }
  });
  
  return Trade;
};

// Export both models
if (mongoose.models.Trade) {
  module.exports = mongoose.models.Trade;
} else {
  module.exports = mongoose.model('Trade', tradeSchema);
}

module.exports.initTradeModel = initTradeModel;
