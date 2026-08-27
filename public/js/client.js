// Client-side JavaScript with TradingView Lightweight Charts
class TradingApp {
    constructor() {
        this.socket = null;
        this.token = localStorage.getItem('token');
        this.user = null;
        this.currentPrice = 0;
        this.priceHistory = [];
        this.maxHistoryPoints = 500;
        this.activeTrades = [];
        this.tradeHistory = [];
        this.chart = null;
        this.series = null;
        this.isConnected = false;
        this.pendingTrades = new Map();
        
        this.init();
    }
    
    init() {
        this.setupSocket();
        this.setupEventListeners();
        this.initChart();
        
        if (this.token) {
            this.fetchUserProfile();
            this.fetchActiveTrades();
            this.fetchStatistics();
        } else {
            this.showLoginPrompt();
        }
    }
    
    // ==================== Socket Setup ====================
    setupSocket() {
        const socketUrl = process.env.NODE_ENV === 'production' 
            ? window.location.origin 
            : 'http://localhost:3000';
        
        this.socket = io(socketUrl, {
            auth: { token: this.token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 10000
        });
        
        this.socket.on('connect', () => {
            console.log('✅ Connected to server');
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.socket.emit('subscribePrice', 'BTCUSDT');
            this.showNotification('🟢 متصل بالخادم', 'success');
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('❌ Connection error:', error);
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.showNotification('🔴 فشل الاتصال بالخادم', 'error');
        });
        
        this.socket.on('disconnect', () => {
            console.log('🔌 Disconnected from server');
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.showNotification('🔴 تم قطع الاتصال', 'error');
        });
        
        // Price updates
        this.socket.on('priceUpdate', (data) => {
            this.updatePrice(data);
        });
        
        // Trade events
        this.socket.on('tradeCreated', (trade) => {
            this.handleTradeCreated(trade);
        });
        
        this.socket.on('tradeResult', (result) => {
            this.handleTradeResult(result);
        });
        
        this.socket.on('tradeCancelled', (data) => {
            this.handleTradeCancelled(data);
        });
        
        this.socket.on('balanceUpdate', (data) => {
            this.updateBalanceDisplay(data.balance);
        });
        
        this.socket.on('activeTrades', (data) => {
            this.handleActiveTrades(data);
        });
        
        this.socket.on('subscribed', (data) => {
            console.log(`📊 Subscribed to ${data.symbol}`);
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showNotification(error.message || 'حدث خطأ في الاتصال', 'error');
        });
    }
    
    // ==================== TradingView Chart ====================
    initChart() {
        const chartContainer = document.getElementById('tradingChart');
        if (!chartContainer) return;
        
        // Create chart with TradingView Lightweight Charts
        this.chart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: 400,
            layout: {
                background: { color: '#0f0f1e' },
                textColor: '#d1d4dc',
                fontSize: 12,
            },
            grid: {
                vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
                horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    width: 1,
                    color: 'rgba(224, 227, 235, 0.3)',
                    style: LightweightCharts.LineStyle.Dashed,
                },
                horzLine: {
                    width: 1,
                    color: 'rgba(224, 227, 235, 0.3)',
                    style: LightweightCharts.LineStyle.Dashed,
                },
            },
            rightPriceScale: {
                borderColor: 'rgba(197, 203, 216, 0.3)',
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
            timeScale: {
                borderColor: 'rgba(197, 203, 216, 0.3)',
                timeVisible: true,
                secondsVisible: true,
                tickMarkFormatter: (time) => {
                    const date = new Date(time * 1000);
                    return date.toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                },
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
            },
            handleScale: {
                axisPressedMouseMove: true,
                mouseWheel: true,
                pinch: true,
            },
        });
        
        // Create candlestick series
        this.series = this.chart.addCandlestickSeries({
            upColor: '#4caf50',
            downColor: '#f44336',
            borderDownColor: '#f44336',
            borderUpColor: '#4caf50',
            wickDownColor: '#f44336',
            wickUpColor: '#4caf50',
            priceFormat: {
                type: 'price',
                precision: 2,
                minMove: 0.01,
            },
        });
        
        // Add volume series
        this.volumeSeries = this.chart.addHistogramSeries({
            color: 'rgba(79, 195, 247, 0.3)',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: 'volume',
        });
        
        // Set volume scale position
        this.chart.priceScale('volume').applyOptions({
            scaleMargins: {
                top: 0.9,
                bottom: 0,
            },
            visible: true,
            borderColor: 'rgba(197, 203, 216, 0.3)',
        });
        
        // Add price line for current price
        this.priceLine = this.series.createPriceLine({
            price: 0,
            color: '#4fc3f7',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'السعر الحالي',
        });
        
        // Add entry/exit markers
        this.tradeMarkers = [];
        
        // Handle resize
        window.addEventListener('resize', () => {
            if (this.chart) {
                const container = document.getElementById('tradingChart');
                this.chart.applyOptions({
                    width: container.clientWidth,
                    height: 400,
                });
            }
        });
    }
    
    updateChart(data) {
        if (!this.series) return;
        
        const timestamp = Math.floor(data.timestamp / 1000);
        const price = data.price;
        const volume = data.volume || 0;
        
        // Update candlestick data
        const candleData = {
            time: timestamp,
            open: price,
            high: price,
            low: price,
            close: price,
        };
        
        // Check if we have existing data for this time
        const existingData = this.series.data();
        const lastCandle = existingData.length > 0 ? existingData[existingData.length - 1] : null;
        
        if (lastCandle && lastCandle.time === timestamp) {
            // Update last candle
            this.series.update({
                ...candleData,
                high: Math.max(lastCandle.high, price),
                low: Math.min(lastCandle.low, price),
                close: price,
            });
        } else {
            // Add new candle
            this.series.update(candleData);
            
            // Limit data points
            if (existingData.length > this.maxHistoryPoints) {
                this.series.setData(existingData.slice(-this.maxHistoryPoints));
            }
        }
        
        // Update volume
        if (this.volumeSeries) {
            const volumeData = {
                time: timestamp,
                value: volume,
                color: price > (lastCandle?.close || price) ? '#4caf50' : '#f44336',
            };
            this.volumeSeries.update(volumeData);
        }
        
        // Update price line
        if (this.priceLine) {
            this.priceLine.applyOptions({
                price: price,
            });
        }
    }
    
    addTradeMarker(trade) {
        if (!this.chart) return;
        
        const timestamp = Math.floor(new Date(trade.expirationTime || Date.now()).getTime() / 1000);
        const isWin = trade.status === 'WIN';
        const isLoss = trade.status === 'LOSS';
        const isPending = trade.status === 'PENDING';
        
        let color, shape, text;
        
        if (isWin) {
            color = '#4caf50';
            shape = 'arrowUp';
            text = '🟢 ربح';
        } else if (isLoss) {
            color = '#f44336';
            shape = 'arrowDown';
            text = '🔴 خسارة';
        } else if (isPending) {
            color = '#ffa726';
            shape = 'circle';
            text = '⏳ معلق';
        } else {
            return;
        }
        
        const marker = {
            time: timestamp,
            position: isWin ? 'aboveBar' : 'belowBar',
            color: color,
            shape: shape,
            text: text,
            size: 2,
        };
        
        this.series.setMarkers([...this.tradeMarkers, marker]);
        this.tradeMarkers.push(marker);
    }
    
    // ==================== Price Updates ====================
    updatePrice(data) {
        this.currentPrice = data.price;
        
        // Update price display
        const priceElement = document.getElementById('currentPrice');
        if (priceElement) {
            priceElement.textContent = `$${data.price.toFixed(2)}`;
        }
        
        // Update price change
        if (this.priceHistory.length > 0) {
            const oldPrice = this.priceHistory[this.priceHistory.length - 1];
            const change = ((data.price - oldPrice) / oldPrice * 100);
            const changeElement = document.getElementById('priceChange');
            if (changeElement) {
                changeElement.textContent = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
                changeElement.className = change >= 0 ? 'positive' : 'negative';
            }
        }
        
        // Store history
        this.priceHistory.push({
            time: data.timestamp,
            price: data.price,
            volume: data.volume || 0,
        });
        
        if (this.priceHistory.length > this.maxHistoryPoints) {
            this.priceHistory.shift();
        }
        
        // Update chart
        this.updateChart({
            timestamp: data.timestamp,
            price: data.price,
            volume: data.volume || 0,
        });
        
        // Update pending trades (check for potential exits)
        this.checkPendingTrades(data.price);
    }
    
    checkPendingTrades(currentPrice) {
        this.activeTrades.forEach(trade => {
            if (trade.status === 'PENDING') {
                const timeLeft = new Date(trade.expirationTime).getTime() - Date.now();
                const progress = ((trade.duration * 1000 - timeLeft) / (trade.duration * 1000)) * 100;
                
                // Update progress bar if exists
                const progressBar = document.querySelector(`[data-trade-id="${trade.id}"] .trade-progress`);
                if (progressBar) {
                    progressBar.style.width = `${Math.min(100, progress)}%`;
                }
            }
        });
    }
    
    // ==================== Trade Handlers ====================
    handleTradeCreated(trade) {
        this.addTradeToUI(trade);
        this.showNotification(`✅ تم فتح صفقة ${trade.direction} بقيمة $${trade.amount}`, 'success');
        this.updateBalance();
        this.fetchStatistics();
        
        // Add marker to chart
        this.addTradeMarker({
            ...trade,
            status: 'PENDING',
            expirationTime: trade.expirationTime,
        });
        
        // Update pending trades list
        this.activeTrades.push(trade);
        this.updatePendingTradesCount();
    }
    
    handleTradeResult(result) {
        const { tradeId, direction, entryPrice, exitPrice, isWin, profitLoss, amount } = result;
        
        // Update trade in UI
        this.updateTradeStatus(tradeId, isWin ? 'WIN' : 'LOSS', exitPrice, profitLoss);
        
        // Add marker to chart
        this.addTradeMarker({
            id: tradeId,
            status: isWin ? 'WIN' : 'LOSS',
            expirationTime: new Date().toISOString(),
        });
        
        // Show result notification
        const resultMessage = isWin 
            ? `🎉 ربح! +$${profitLoss.toFixed(2)}` 
            : `😞 خسارة! -$${Math.abs(profitLoss).toFixed(2)}`;
        
        this.showNotification(resultMessage, isWin ? 'success' : 'error');
        
        // Play sound effect
        this.playSound(isWin ? 'win' : 'loss');
        
        // Update balance and statistics
        this.updateBalance();
        this.fetchStatistics();
        
        // Remove from active trades
        this.activeTrades = this.activeTrades.filter(t => t.id !== tradeId);
        this.updatePendingTradesCount();
        
        // Update trade history
        this.addToHistory({
            id: tradeId,
            direction,
            amount,
            entryPrice,
            exitPrice,
            status: isWin ? 'WIN' : 'LOSS',
            profitLoss,
            timestamp: new Date().toISOString(),
        });
    }
    
    handleTradeCancelled(data) {
        this.updateTradeStatus(data.tradeId, 'CANCELLED');
        this.showNotification('🔄 تم إلغاء الصفقة', 'warning');
        this.updateBalance();
        this.fetchStatistics();
        
        // Remove from active trades
        this.activeTrades = this.activeTrades.filter(t => t.id !== data.tradeId);
        this.updatePendingTradesCount();
    }
    
    handleActiveTrades(data) {
        data.trades.forEach(trade => {
            this.addTradeToUI(trade);
            this.activeTrades.push(trade);
            
            // Add marker to chart
            this.addTradeMarker({
                ...trade,
                status: 'PENDING',
            });
        });
        this.updatePendingTradesCount();
    }
    
    // ==================== UI Updates ====================
    addTradeToUI(trade) {
        const table = document.getElementById('tradesTable');
        if (!table) return;
        
        const row = document.createElement('div');
        row.className = 'trade-row';
        row.dataset.tradeId = trade.id;
        
        const statusClass = trade.status ? trade.status.toLowerCase() : 'pending';
        const timeLeft = trade.expirationTime ? this.getTimeLeft(trade.expirationTime) : '--';
        
        row.innerHTML = `
            <div class="trade-info">
                <span class="trade-symbol">BTC/USDT</span>
                <span class="trade-direction ${trade.direction.toLowerCase()}">${trade.direction}</span>
            </div>
            <div class="trade-details">
                <span>$${trade.amount.toFixed(2)}</span>
                <span>$${trade.entryPrice.toFixed(2)}</span>
                ${trade.exitPrice ? `<span>$${trade.exitPrice.toFixed(2)}</span>` : '<span>--</span>'}
                <span>${trade.duration}s</span>
                <span class="trade-timer">${timeLeft}</span>
                <span class="status-${statusClass}">${trade.status || 'PENDING'}</span>
                ${trade.profitLoss !== undefined ? `<span class="${trade.profitLoss >= 0 ? 'profit' : 'loss'}">$${trade.profitLoss.toFixed(2)}</span>` : '<span>--</span>'}
            </div>
            <div class="trade-actions">
                ${(!trade.status || trade.status === 'PENDING') ? 
                    `<button class="cancel-btn" onclick="app.cancelTrade('${trade.id}')">❌ إلغاء</button>` : ''}
            </div>
            <div class="trade-progress-container">
                <div class="trade-progress" style="width: ${trade.status === 'PENDING' ? '0%' : '100%'}"></div>
            </div>
        `;
        
        table.prepend(row);
        
        // Start timer if pending
        if (trade.status === 'PENDING' && trade.expirationTime) {
            this.startTradeTimer(trade.id, trade.expirationTime);
        }
    }
    
    updateTradeStatus(tradeId, status, exitPrice = null, profitLoss = null) {
        const rows = document.querySelectorAll('.trade-row');
        rows.forEach(row => {
            if (row.dataset.tradeId === tradeId) {
                const statusSpan = row.querySelector('[class^="status-"]');
                if (statusSpan) {
                    statusSpan.textContent = status;
                    statusSpan.className = `status-${status.toLowerCase()}`;
                }
                
                if (exitPrice !== null) {
                    const details = row.querySelectorAll('.trade-details span');
                    if (details.length >= 3) {
                        details[2].textContent = `$${exitPrice.toFixed(2)}`;
                    }
                }
                
                if (profitLoss !== null) {
                    const details = row.querySelectorAll('.trade-details span');
                    if (details.length >= 6) {
                        details[6].textContent = `$${profitLoss.toFixed(2)}`;
                        details[6].className = profitLoss >= 0 ? 'profit' : 'loss';
                    }
                }
                
                // Remove cancel button
                const cancelBtn = row.querySelector('.cancel-btn');
                if (cancelBtn) {
                    cancelBtn.remove();
                }
                
                // Update progress bar
                const progressBar = row.querySelector('.trade-progress');
                if (progressBar) {
                    progressBar.style.width = '100%';
                }
                
                // Update timer
                const timerSpan = row.querySelector('.trade-timer');
                if (timerSpan) {
                    timerSpan.textContent = '✅ تم';
                }
            }
        });
    }
    
    startTradeTimer(tradeId, expirationTime) {
        const timerInterval = setInterval(() => {
            const rows = document.querySelectorAll('.trade-row');
            let found = false;
            
            rows.forEach(row => {
                if (row.dataset.tradeId === tradeId) {
                    found = true;
                    const timerSpan = row.querySelector('.trade-timer');
                    const progressBar = row.querySelector('.trade-progress');
                    
                    if (timerSpan) {
                        const timeLeft = this.getTimeLeft(expirationTime);
                        timerSpan.textContent = timeLeft;
                    }
                    
                    if (progressBar) {
                        const totalDuration = new Date(expirationTime).getTime() - new Dat
