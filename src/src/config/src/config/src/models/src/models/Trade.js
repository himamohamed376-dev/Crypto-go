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
  type: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: [true, 'Trade type is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.0001, 'Amount must be greater than 0']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price must be greater than 0']
  },
  expirationTime: {
    type: Date,
    required: [true, 'Expiration time is required'],
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'Expiration time must be in the future'
    }
  },
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING'
  },
  profitLoss: {
    type: Number,
    default: 0
  },
  closedAt: {
    type: Date
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
    type: {
      type: DataTypes.ENUM('BUY', 'SELL'),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(15, 8),
      allowNull: false,
      validate: {
        min: 0.0001
      }
    },
    price: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    },
    expirationTime: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        isAfter: new Date().toISOString()
      }
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED'),
      defaultValue: 'PENDING'
    },
    profitLoss: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0
    },
    closedAt: {
      type: DataTypes.DATE
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
