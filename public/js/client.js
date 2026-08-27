// Client-side JavaScript for trading app
class TradingApp {
    constructor() {
        this.socket = null;
        this.token = localStorage.getItem('token');
        this.user = null;
        this.currentPrice = 0;
        this.chart = null;
        this.priceHistory = [];
        this.maxHistoryPoints = 100;
        this.activeTrades = [];
        this.tradeHistory = [];
        
        this.init();
    }
    
    init() {
        this.setupSocket();
        this.setupEventListeners();
        this.setupChart();
        
        if (this.token) {
            this.fetchUserProfile();
            this.fetchActiveTrades();
        } else {
            this.showLoginPrompt();
        }
    }
    
    setupSocket() {
        this.socket = io('http://localhost:3000', {
            auth: { token: this.token },
            transports: ['websocket']
        });
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.socket.emit('subscribePrice', 'BTCUSDT');
            this.showNotification('متصل بالخادم', 'success');
        });
        
        this.socket.on('priceUpdate', (data) => {
            this.updatePrice(data);
        });
        
        this.socket.on('tradeCreated', (trade) => {
            this.addTradeToTable(trade);
            this.showNotification(`تم فتح صفقة ${trade.direction} بقيمة $${trade.amount}`, 'success');
            this.updateBalance();
        });
        
        this.socket.on('tradeResult', (result) => {
            this.handleTradeResult(result);
        });
        
        this.socket.on('tradeCancelled', (data) => {
            this.updateTradeStatus(data.tradeId, 'CANCELLED');
            this.showNotification('تم إلغاء الصفقة', 'warning');
            this.updateBalance();
        });
        
        this.socket.on('balanceUpdate', (data) => {
            this.updateBalanceDisplay(data.balance);
        });
        
        this.socket.on('activeTrades', (data) => {
            data.trades.forEach(trade => this.addTradeToTable(trade));
            this.activeTrades = data.trades;
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showNotification('تم قطع الاتصال بالخادم', 'error');
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showNotification(error.message || 'حدث خطأ في الاتصال', 'error');
        });
    }
    
    setupEventListeners() {
        document.getElementById('placeTradeBtn').addEventListener('click', () => {
            this.placeTrade();
        });
        
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
        
        // Duration buttons
        document.querySelectorAll('.duration-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById('selectedDuration').value = e.target.dataset.duration;
            });
        });
    }
    
    placeTrade() {
        const direction = document.querySelector('input[name="direction"]:checked')?.value;
        const amount = parseFloat(document.getElementById('tradeAmount').value);
        const duration = parseInt(document.getElementById('selectedDuration').value);
        
        if (!direction) {
            this.showNotification('الرجاء اختيار اتجاه الصفقة (UP/DOWN)', 'error');
            return;
        }
        
        if (!amount || amount < 1) {
            this.showNotification('الرجاء إدخال مبلغ صحيح (الحد الأدنى $1)', 'error');
            return;
        }
        
        if (amount > 10000) {
            this.showNotification('الحد الأقصى للمبلغ هو $10,000', 'error');
            return;
        }
        
        if (!duration) {
            this.showNotification('الرجاء اختيار مدة الصفقة', 'error');
            return;
        }
        
        // Disable button to prevent double submission
        const btn = document.getElementById('placeTradeBtn');
        btn.disabled = true;
        btn.textContent = 'جاري التنفيذ...';
        
        this.socket.emit('createTrade', {
            direction,
            amount,
            duration
        }, (response) => {
            btn.disabled = false;
            btn.textContent = 'تنفيذ الصفقة';
            
            if (!response.success) {
                this.showNotification(response.message || 'فشل تنفيذ الصفقة', 'error');
            }
        });
    }
    
    handleTradeResult(result) {
        const { tradeId, direction, entryPrice, exitPrice, isWin, profitLoss, amount } = result;
        
        // Update trade status in table
        this.updateTradeStatus(tradeId, isWin ? 'WIN' : 'LOSS');
        
        // Update trade with exit price
        this.updateTradeExitPrice(tradeId, exitPrice, profitLoss);
        
        // Show result notification
        const resultMessage = isWin 
            ? `🎉 ربح! $${profitLoss.toFixed(2)}` 
            : `😞 خسارة! $${Math.abs(profitLoss).toFixed(2)}`;
        
        this.showNotification(resultMessage, isWin ? 'success' : 'error');
        
        // Update balance
        this.updateBalance();
        
        // Add to history
        this.addToHistory({
            id: tradeId,
            direction,
            amount,
            entryPrice,
            exitPrice,
            status: isWin ? 'WIN' : 'LOSS',
            profitLoss,
            timestamp: new Date().toISOString()
        });
        
        // Update statistics
        this.updateStatistics();
    }
    
    updatePrice(data) {
        this.currentPrice = data.price;
        document.getElementById('currentPrice').textContent = `$${data.price.toFixed(2)}`;
        
        // Update price change
        if (this.priceHistory.length > 0) {
            const oldPrice = this.priceHistory[this.priceHistory.length - 1];
            const change = ((data.price - oldPrice) / oldPrice * 100);
            const changeElement = document.getElementById('priceChange');
            changeElement.textContent = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
            changeElement.className = change >= 0 ? 'positive' : 'negative';
        }
        
        // Update price history for chart
        this.priceHistory.push(data.price);
        if (this.priceHistory.length > this.maxHistoryPoints) {
            this.priceHistory.shift();
        }
        
        this.drawChart();
    }
    
    drawChart() {
        if (!this.chart || this.priceHistory.length < 2) return;
        
        const canvas = document.getElementById('tradingChart');
        if (!canvas) return;
        
        const ctx = this.chart;
        const width = canvas.width || 600;
        const height = canvas.height || 300;
        
        ctx.clearRect(0, 0, width, height);
        
        // Draw grid
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const y = (height / 5) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Draw price line
        const minPrice = Math.min(...this.priceHistory);
        const maxPrice = Math.max(...this.priceHistory);
        const range = maxPrice - minPrice || 1;
        
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        this.priceHistory.forEach((price, index) => {
            const x = (index / this.priceHistory.length) * width;
            const y = height - ((price - minPrice) / range) * (height - 20) - 10;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    }
    
    addTradeToTable(trade) {
        const table = document.getElementById('tradesTable');
        const row = document.createElement('div');
        row.className = 'trade-row';
        row.dataset.tradeId = trade.id;
        
        const statusClass = trade.status ? trade.status.toLowerCase() : 'pending';
        
        row.innerHTML = `
            <span>BTC/USDT</span>
            <span class="${trade.direction.toLowerCase()}">${trade.direction}</span>
            <span>$${trade.amount.toFixed(2)}</span>
            <span>$${trade.entryPrice.toFixed(2)}</span>
            ${trade.exitPrice ? `<span>$${trade.exitPrice.toFixed(2)}</span>` : '<span>-</span>'}
            <span>${trade.duration}s</span>
            <span class="status-${statusClass}">${trade.status || 'PENDING'}</span>
            ${trade.profitLoss ? `<span class="${trade.profitLoss >= 0 ? 'profit' : 'loss'}">$${trade.profitLoss.toFixed(2)}</span>` : '<span>-</span>'}
            ${(!trade.status || trade.status === 'PENDING') ? `<button onclick="app.cancelTrade('${trade.id}')">إلغاء</button>` : ''}
        `;
        
        table.prepend(row);
    }
    
    updateTradeStatus(tradeId, status) {
        const rows = document.querySelectorAll('.trade-row');
        rows.forEach(row => {
            if (row.dataset.tradeId === tradeId) {
                const statusSpan = row.querySelector('[class^="status-"]');
                if (statusSpan) {
                    statusSpan.textContent = status;
                    statusSpan.className = `status-${status.toLowerCase()}`;
                }
                
                // Remove cancel button if trade is no longer pending
                const cancelBtn = row.querySelector('button');
                if (cancelBtn && status !== 'PENDING') {
                    cancelBtn.remove();
                }
            }
        });
    }
    
    updateTradeExitPrice(tradeId, exitPrice, profitLoss) {
        const rows = document.querySelectorAll('.trade-row');
        rows.forEach(row => {
            if (row.dataset.tradeId === tradeId) {
                const cells = row.querySelectorAll('span');
                if (cells.length >= 5) {
                    cells[4].textContent = `$${exitPrice.toFixed(2)}`;
                }
                if (cells.length >= 8) {
                    cells[7].textContent = `$${profitLoss.toFixed(2)}`;
                    cells[7].className = profitLoss >= 0 ? 'profit' : 'loss';
                }
            }
        });
    }
    
    async cancelTrade(tradeId) {
        if (!confirm('هل أنت متأكد من إلغاء هذه الصفقة؟')) return;
        
        this.socket.emit('cancelTrade', tradeId, (response) => {
            if (!response.success) {
                this.showNotification(response.message || 'فشل إلغاء الصفقة', 'error');
            }
        });
    }
    
    async fetchUserProfile() {
        try {
            const response = await fetch('/api/auth/profile', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.user = data.data;
                this.updateUserInfo();
            } else {
                this.token = null;
                localStorage.removeItem('token');
                this.showLoginPrompt();
            }
        } catch (error) {
            console.error('Failed to fetch profile:', error);
        }
    }
    
    async fetchActiveTrades() {
        try {
            const response = await fetch('/api/trades/active', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                data.data.forEach(trade => this.addTradeToTable(trade));
                this.activeTrades = data.data;
            }
        } catch (error) {
            console.error('Failed to fetch active trades:', error);
        }
    }
    
    updateUserInfo() {
        if (!this.user) return;
        document.getElementById('username').textContent = `مرحباً، ${this.user.username}`;
        this.updateBalanceDisplay(this.user.balance);
    }
    
    updateBalanceDisplay(balance) {
        document.getElementById('balance').textContent = `الرصيد: $${balance.toFixed(2)}`;
        if (this.user) {
            this.user.balance = balance;
        }
    }
    
    async updateBalance() {
        try {
            const response = await fetch('/api/auth/profile', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateBalanceDisplay(data.data.balance);
            }
        } catch (error) {
            console.error('Failed to update balance:', error);
        }
    }
    
    addToHistory(trade) {
        this.tradeHistory.unshift(trade);
        if (this.tradeHistory.length > 100) {
            this.tradeHistory.pop();
        }
        this.updateHistoryTable();
    }
    
    updateHistoryTable() {
        const historyTable = document.getElementById('historyTable');
        if (!historyTable) return;
        
        historyTable.innerHTML = '';
        this.tradeHistory.slice(0, 20).forEach(trade => {
            const row = document.createElement('div');
            row.className = 'history-row';
            row.innerHTML = `
                <span>${new Date(trade.timestamp).toLocaleTimeString()}</span>
                <span class="${trade.direction.toLowerCase()}">${trade.direction}</span>
                <span>$${trade.amount.toFixed(2)}</span>
                <span>$${trade.entryPrice.toFixed(2)}</span>
                <span>$${(trade.exitPrice || 0).toFixed(2)}</span>
                <span class="status-${(trade.status || 'pending').toLowerCase()}">${trade.status || 'PENDING'}</span>
                <span class="${trade.profitLoss >= 0 ? 'profit' : 'loss'}">$${(trade.profitLoss || 0).toFixed(2)}</span>
            `;
            historyTable.appendChild(row);
        });
    }
    
    async updateStatistics() {
        try {
            const response = await fetch('/api/trades/statistics', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.displayStatistics(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch statistics:', error);
        }
    }
    
    displayStatistics(stats) {
        const statsContainer = document.getElementById('statistics');
        if (!statsContainer) return;
        
        statsContainer.innerHTML = `
            <div class="stat-item">
                <span>إجمالي الصفقات:</span>
                <span>${stats.totalTrades}</span>
            </div>
            <div class="stat-item">
                <span>الربح:</span>
                <span>${stats.winTrades}</span>
            </div>
            <div class="stat-item">
                <span>الخسارة:</span>
                <span>${stats.lossTrades}</span>
            </div>
            <div class="stat-item">
                <span>نسبة الربح:</span>
                <span>${stats.winRate.toFixed(1)}%</span>
            </div>
            <div class="stat-item">
                <span>إجمالي الربح/الخسارة:</span>
                <span class="${stats.totalProfitLoss >= 0 ? 'profit' : 'loss'}">$${stats.totalProfitLoss.toFixed(2)}</span>
            </div>
        `;
    }
    
    logout() {
        localStorage.removeItem('token');
        this.token = null;
        this.user = null;
        if (this.socket) {
            this.socket.disconnect();
        }
        this.showLoginPrompt();
        this.showNotification('تم تسجيل الخروج', 'info');
    }
    
    showLoginPrompt() {
        window.location.href = '/login.html';
    }
    
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);
    }
}

// Initialize the app
const app = new TradingApp();
