const WebSocket = require('ws');
const axios = require('axios');

// Store active WebSocket connections
let binanceWS = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

const initializeBinanceWebSocket = (io, logger) => {
  const wsURL = process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws';
  
  const connect = () => {
    binanceWS = new WebSocket(wsURL);
    
    binanceWS.on('open', () => {
      logger.info('Connected to Binance WebSocket');
      reconnectAttempts = 0;
      
      // Subscribe to BTC/USDT price stream
      const subscribeMsg = {
        method: 'SUBSCRIBE',
        params: ['btcusdt@trade'],
        id: 1
      };
      binanceWS.send(JSON.stringify(subscribeMsg));
    });
    
    binanceWS.on('message', (data) => {
      try {
        const parsedData = JSON.parse(data);
        
        // Handle trade data
        if (parsedData.e === 'trade' && parsedData.s === 'BTCUSDT') {
          const priceData = {
            symbol: parsedData.s,
            price: parseFloat(parsedData.p),
            volume: parseFloat(parsedData.q),
            timestamp: parsedData.T,
            tradeId: parsedData.t,
            buyer: parsedData.m ? 'SELL' : 'BUY'
          };
          
          // Broadcast to all connected clients
          io.emit('priceUpdate', priceData);
          
          // Also store in a cache or database if needed
          // cachePrice(priceData);
        }
      } catch (error) {
        logger.error('Error parsing WebSocket message:', error);
      }
    });
    
    binanceWS.on('error', (error) => {
      logger.error('Binance WebSocket error:', error);
    });
    
    binanceWS.on('close', () => {
      logger.warn('Binance WebSocket disconnected');
      reconnect();
    });
  };
  
  const reconnect = () => {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      logger.info(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      setTimeout(connect, 5000 * reconnectAttempts);
    } else {
      logger.error('Max reconnection attempts reached. Please check connection.');
    }
  };
  
  connect();
};

// Function to get historical data from Binance API
const getHistoricalData = async (symbol = 'BTCUSDT', interval = '1m', limit = 100) => {
  try {
    const response = await axios.get(`${process.env.BINANCE_API_URL || 'https://api.binance.com'}/api/v3/klines`, {
      params: {
        symbol,
        interval,
        limit
      }
    });
    
    return response.data.map(candle => ({
      openTime: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
      closeTime: candle[6]
    }));
  } catch (error) {
    throw new Error(`Failed to fetch historical data: ${error.message}`);
  }
};

module.exports = {
  initializeBinanceWebSocket,
  getHistoricalData
};
