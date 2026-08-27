const mongoose = require('mongoose');
const { Sequelize } = require('sequelize');
const User = require('../models/User');
const Trade = require('../models/Trade');

let sequelize;

const connectDB = async (logger) => {
  try {
    // Choose database based on environment variable
    const dbType = process.env.DB_TYPE || 'mongodb';

    if (dbType === 'mongodb') {
      await connectMongoDB(logger);
    } else if (dbType === 'postgresql') {
      await connectPostgreSQL(logger);
    } else {
      logger.warn('No database selected. Using in-memory storage.');
    }
  } catch (error) {
    logger.error('Database connection error:', error);
    process.exit(1);
  }
};

const connectMongoDB = async (logger) => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trading_app';
  
  await mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  
  logger.info('MongoDB connected successfully');
  
  // Define schemas for MongoDB
  const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    balance: { type: Number, default: 10000 },
    createdAt: { type: Date, default: Date.now }
  });
  
  const tradeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    symbol: { type: String, required: true },
    type: { type: String, enum: ['BUY', 'SELL'], required: true },
    amount: { type: Number, required: true },
    price: { type: Number, required: true },
    expirationTime: { type: Date, required: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'EXPIRED'], default: 'PENDING' },
    createdAt: { type: Date, default: Date.now }
  });
  
  // Create models
  mongoose.model('User', userSchema);
  mongoose.model('Trade', tradeSchema);
};

const connectPostgreSQL = async (logger) => {
  const sequelize = new Sequelize(
    process.env.PG_DATABASE || 'trading_db',
    process.env.PG_USER || 'postgres',
    process.env.PG_PASSWORD || 'postgres',
    {
      host: process.env.PG_HOST || 'localhost',
      port: process.env.PG_PORT || 5432,
      dialect: 'postgres',
      logging: msg => logger.debug(msg),
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  );
  
  await sequelize.authenticate();
  logger.info('PostgreSQL connected successfully');
  
  // Initialize models
  User.init(sequelize);
  Trade.init(sequelize);
  
  // Define associations
  User.hasMany(Trade, { foreignKey: 'userId' });
  Trade.belongsTo(User, { foreignKey: 'userId' });
  
  await sequelize.sync({ alter: true });
  logger.info('Database synchronized');
};

module.exports = { connectDB, sequelize };
