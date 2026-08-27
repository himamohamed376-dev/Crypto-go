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
        
        this.init();
    }
    
    init() {
        this.setupSocket();
        this.setupEventListeners();
        this.setupChart();
        
        if (this.token) {
            this.fetchUserProfile();
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
        });
        
        this.socket.on('priceUpdate', (data) => {
            this.updatePrice(data);
        });
        
        this.socket.on('tradeCreated', (trade) => {
            this.addTradeToTable(trade);
            this.showNotification('تم إنشاء الصفقة بنجاح', 'success');
        });
        
        this.socket.on('tradeCancelled', (data) => {
            this.updateTradeStatus(data.tradeId, 'CANCELLED');
            this.showNotification('تم إلغاء الصفقة', 'warning');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showNotification('حدث خطأ في الاتصال', 'error');
        });
    }
    
    setupEventListeners() {
        document.getElementById('placeTradeBtn').addEventListener('click', () => {
            this.placeTrade();
        });
        
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }
    
    setupChart() {
        const canvas = document.getElementById('tradingChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        // Simple canvas chart setup
        // Would use Chart.js or similar in production
        this.chart = ctx;
        this.drawChart();
    }
    
    updatePrice(data) {
        this.currentPrice = data.price;
        document.getElementById('currentPrice').textContent = `$${data.price.toFixed(2)}`;
        
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
    
    placeTrade() {
        const type = document.getElementById('tradeType').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const price = parseFloat(document.getElementById('price').value) || this.currentPrice;
        const expirationTime = document.getElementById('expirationTime').value;
        
        if (!amount || amount <= 0) {
            this.showNotification('الرجاء إدخال كمية صحيحة', 'error');
            return;
        }
        
        if (!expirationTime) {
            this.showNotification('الرجاء تحديد وقت انتهاء الصفقة', 'error');
            return;
        }
        
        const tradeData = {
            symbol: 'BTCUSDT',
            type,
            amount,
            price,
            expirationTime: new Date(expirationTime).toISOString()
        };
        
        this.socket.emit('createTrade', tradeData);
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
                this.fetchUserTrades();
            } else {
                this.token = null;
                localStorage.removeItem('token');
                this.showLoginPrompt();
            }
        } catch (error) {
            console.error('Failed to fetch profile:', error);
        }
    }
    
    updateUserInfo() {
        if (!this.user) return;
        document.getElementById('username').textContent = `مرحباً، ${this.user.username}`;
        document.getElementById('balance').textContent = `الرصيد: $${this.user.balance.toFixed(2)}`;
    }
    
    async fetchUserTrades() {
        try {
            const response = await fetch('/api/trades', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                data.data.forEach(trade => this.addTradeToTable(trade));
            }
        } catch (error) {
            console.error('Failed to fetch trades:', error);
        }
    }
    
    addTradeToTable(trade) {
        const table = document.getElementById('tradesTable');
        const row = document.createElement('div');
        row.className = 'trade-row';
        row.dataset.tradeId = trade.id;
        
        row.innerHTML = `
            <span>${trade.symbol}</span>
            <span class="${trade.type.toLowerCase()}">${trade.type}</span>
            <span>${trade.amount}</span>
            <span>$${trade.price.toFixed(2)}</span>
            <span>${new Date(trade.expirationTime).toLocaleString()}</span>
            <span class="status-${trade.status.toLowerCase()}">${trade.status}</span>
            ${trade.status === 'PENDING' ? `<button onclick="app.cancelTrade('${trade.id}')">إلغاء</button>` : ''}
        `;
        
        table.prepend(row);
    }
    
    updateTradeStatus(tradeId, status) {
        const rows = document.querySelectorAll('.trade-row');
        rows.forEach(row => {
            if (row.dataset.tradeId === tradeId) {
                const statusSpan = row.querySelector('.status-pending');
                if (statusSpan) {
                    statusSpan.textContent = status;
                    statusSpan.className = `status-${status.toLowerCase()}`;
                }
            }
        });
    }
    
    async cancelTrade(tradeId) {
        if (!confirm('هل أنت متأكد من إلغاء هذه الصفقة؟')) return;
        
        try {
            const response = await fetch(`/api/trades/${tradeId}/cancel`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateTradeStatus(tradeId, 'CANCELLED');
                this.showNotification('تم إلغاء الصفقة بنجاح', 'success');
                this.fetchUserProfile(); // Update balance
            } else {
                const error = await response.json();
                this.showNotification(error.message || 'فشل إلغاء الصفقة', 'error');
            }
        } catch (error) {
            console.error('Failed to cancel trade:', error);
            this.showNotification('حدث خطأ أثناء إلغاء الصفقة', 'error');
        }
    }
    
    logout() {
        localStorage.removeItem('token');
        this.token = null;
        this.user = null;
        this.showLoginPrompt();
        this.showNotification('تم تسجيل الخروج', 'info');
    }
    
    showLoginPrompt() {
        // In a real app, show login/register modal
        // For demo, redirect to login page
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
