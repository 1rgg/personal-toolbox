// 快递查询网页主要逻辑
document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const trackingInput = document.getElementById('trackingNumber');
    const queryBtn = document.getElementById('queryBtn');
    const clearBtn = document.getElementById('clearBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const historySection = document.getElementById('historySection');
    const historyList = document.getElementById('historyList');
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const resultSection = document.getElementById('resultSection');
    const packageInfo = document.getElementById('packageInfo');
    const trackingTimeline = document.getElementById('trackingTimeline');
    
    // 包裹信息元素
    const companyName = document.getElementById('companyName');
    const trackingNum = document.getElementById('trackingNum');
    const currentStatus = document.getElementById('currentStatus');
    const updateTime = document.getElementById('updateTime');
    const statusBadge = document.getElementById('statusBadge');
    const timeline = document.getElementById('timeline');
    
    // 历史记录存储键
    const HISTORY_KEY = 'kuaidi_query_history';
    
    // 标记是否刚点击了清除按钮
    let justCleared = false;
    
    // 状态映射
    function getStateText(state) {
        const stateMap = {
            'SIGN': '已签收',
            'DELIVERING': '派送中',
            'TRANSPORT': '运输中',
            'ACCEPT': '已揽收',
            'STA_INBOUND': '已到达',
            'EXCEPTION': '异常',
            'PENDING': '待处理'
        };
        return stateMap[state] || state || '暂无状态';
    }
    
    // 时间戳格式化（毫秒时间戳 -> 2025-05-05 14:37:41）
    function formatTimestamp(timestamp) {
        if (!timestamp) return '暂无时间';
        if (typeof timestamp === 'string' && !/^\d+$/.test(timestamp)) return timestamp;
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        const second = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    }
    
    // 初始化
    init();
    
    function init() {
        // 加载历史记录
        loadHistory();
        
        // 绑定事件
        bindEvents();
    }
    
    function bindEvents() {
        // 查询按钮点击事件
        queryBtn.addEventListener('click', handleQuery);
        
        // 输入框回车事件
        trackingInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleQuery();
            }
        });
        
        // 清空按钮事件
        clearBtn.addEventListener('click', function() {
            trackingInput.value = '';
            clearBtn.style.display = 'none';
            historySection.style.display = 'none';
            justCleared = true;
            trackingInput.focus();
            // 重置标记，允许后续 focus 显示历史
            setTimeout(function() { justCleared = false; }, 100);
        });
        
        // 清空历史记录事件
        clearHistoryBtn.addEventListener('click', clearHistory);
        
        // 输入框获得焦点时显示历史记录
        trackingInput.addEventListener('focus', function() {
            if (!justCleared && trackingInput.value && getHistory().length > 0) {
                historySection.style.display = 'block';
            }
        });
        
        // 点击其他区域时隐藏历史记录
        document.addEventListener('click', function(e) {
            if (!historySection.contains(e.target) && e.target !== trackingInput) {
                historySection.style.display = 'none';
            }
        });
        
        // 按下Escape键时隐藏历史记录
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                historySection.style.display = 'none';
            }
        });
    }
    
    // 处理查询
    async function handleQuery() {
        const trackingNumber = trackingInput.value.trim();
        
        if (!trackingNumber) {
            showError('请输入快递单号');
            trackingInput.focus();
            return;
        }
        
        // 显示加载状态
        showLoading();
        hideError();
        hideResult();
        
        let querySuccess = false;
        
        try {
            // 调用API查询
            const result = await queryTracking(trackingNumber);
            
            // 检查API响应状态（新API：code=200成功，400错误）
            if (result.code == 200) {
                // 转换数据格式
                const formattedData = {
                    company: result.name || '未知快递公司',
                    number: result.number || trackingNumber,
                    status: result.statusmsg || getStateText(result.status),
                    updateTime: result.lasttime || '暂无更新时间',
                    traces: (Array.isArray(result.data) ? result.data
                        : Array.isArray(result.list) ? result.list : []).map(detail => ({
                        time: formatTimestamp(detail.time || detail.ftime),
                        description: detail.desc || detail.context || '',
                        location: detail.areaName || detail.location || detail.area || '',
                        status: detail.logisticsStatus || detail.status || ''
                    }))
                };
                
                // 显示结果
                displayResult(formattedData);
                
                // 保存到历史记录
                saveToHistory(trackingNumber, formattedData.company, formattedData.status);
                
                querySuccess = true;
            } else {
                showError(result.msg || '查询失败，请检查单号是否正确');
            }
        } catch (error) {
            console.error('查询错误:', error);
            showError('网络错误，请稍后重试');
        } finally {
            hideLoading();
            
            // 查询成功后，将焦点设置到输入框，方便继续查询
            if (querySuccess) {
                trackingInput.focus();
            }
        }
    }
    
    // 调用API查询
    async function queryTracking(trackingNumber) {
        const apiUrl = `/api/track?number=${encodeURIComponent(trackingNumber)}`;
        const response = await fetch(apiUrl, { cache: 'no-store' });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    }
    
    // 显示查询结果
    function displayResult(data) {
        if (!data) {
            showError('未获取到快递信息');
            return;
        }
        
        // 更新包裹基础信息
        companyName.textContent = data.company || '未知快递公司';
        trackingNum.textContent = data.number || trackingInput.value.trim();
        currentStatus.textContent = data.status || '暂无状态信息';
        updateTime.textContent = data.updateTime || '暂无更新时间';
        
        // 更新状态标签
        updateStatusBadge(data.status);
        
        // 清空并生成物流轨迹时间线
        timeline.innerHTML = '';
        
        if (data.traces && Array.isArray(data.traces) && data.traces.length > 0) {
            data.traces.forEach((trace, index) => {
                const timelineItem = createTimelineItem(trace, index === 0);
                timeline.appendChild(timelineItem);
            });
        } else {
            timeline.innerHTML = '<div class="no-traces">暂无物流轨迹信息</div>';
        }
        
        // 显示结果区域
        showResult();
        
        // 滚动到结果区域
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // 创建时间线节点
    function createTimelineItem(trace, isLatest) {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        
        item.innerHTML = `
            <div class="timeline-time">${trace.time || ''}</div>
            <div class="timeline-content">
                <div class="timeline-description">${trace.description || ''}</div>
                ${trace.location ? `<div class="timeline-location">${trace.location}</div>` : ''}
            </div>
        `;
        
        return item;
    }
    
    // 更新状态标签
    function updateStatusBadge(status) {
        statusBadge.textContent = status || '-';
        statusBadge.className = 'status-badge';
        if (!status) { statusBadge.classList.add('is-idle'); return; }
        if (status.indexOf('签收') !== -1) statusBadge.classList.add('is-done');
        else if (status.indexOf('派') !== -1) statusBadge.classList.add('is-move');
        else if (status.indexOf('运输') !== -1 || status.indexOf('中转') !== -1 || status.indexOf('到达') !== -1 || status.indexOf('揽收') !== -1) statusBadge.classList.add('is-transit');
        else if (status.indexOf('异常') !== -1 || status.indexOf('问题') !== -1 || status.indexOf('退') !== -1) statusBadge.classList.add('is-warn');
        else statusBadge.classList.add('is-idle');
    }
    
    // 历史记录管理
    function getHistory() {
        try {
            const history = localStorage.getItem(HISTORY_KEY);
            return history ? JSON.parse(history) : [];
        } catch (e) {
            return [];
        }
    }
    
    function saveToHistory(trackingNumber, company, status) {
        const history = getHistory();
        
        // 检查是否已存在
        const existingIndex = history.findIndex(item => item.number === trackingNumber);
        
        if (existingIndex !== -1) {
            // 更新现有记录
            history[existingIndex] = {
                number: trackingNumber,
                company: company || '未知快递',
                status: status || '',
                lastQuery: new Date().toISOString()
            };
        } else {
            // 添加新记录
            history.unshift({
                number: trackingNumber,
                company: company || '未知快递',
                status: status || '',
                lastQuery: new Date().toISOString()
            });
            
            // 限制历史记录数量
            if (history.length > 10) {
                history.pop();
            }
        }
        
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        loadHistory();
    }
    
    function loadHistory() {
        const history = getHistory();
        
        if (history.length === 0) {
            historySection.style.display = 'none';
            return;
        }
        
        // 仅填充历史列表，不自动显示
        historyList.innerHTML = '';
        
        history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <span class="company">${item.company}</span>
                <span class="number">${item.number}</span>
            `;
            
            historyItem.addEventListener('click', function() {
                trackingInput.value = item.number;
                historySection.style.display = 'none';
                handleQuery();
            });
            
            historyList.appendChild(historyItem);
        });
    }
    
    function clearHistory() {
        if (confirm('确定要清空所有查询历史吗？')) {
            localStorage.removeItem(HISTORY_KEY);
            historySection.style.display = 'none';
        }
    }
    
    // UI状态管理
    function showLoading() {
        loading.classList.add('active');
        queryBtn.disabled = true;
        queryBtn.textContent = '查询中…';
    }
    
    function hideLoading() {
        loading.classList.remove('active');
        queryBtn.disabled = false;
        queryBtn.textContent = '查询';
    }
    
    function showError(message) {
        errorText.textContent = message;
        errorMessage.classList.add('active');
        
        // 5秒后自动隐藏错误信息
        setTimeout(() => {
            hideError();
        }, 5000);
    }
    
    function hideError() {
        errorMessage.classList.remove('active');
    }
    
    function showResult() {
        resultSection.classList.add('active');
    }
    
    function hideResult() {
        resultSection.classList.remove('active');
    }
    
    // 输入框清空按钮显示/隐藏 + 历史记录联动
    trackingInput.addEventListener('input', function() {
        clearBtn.style.display = this.value ? 'block' : 'none';
        // 输入内容时显示历史，清空时隐藏
        if (this.value && getHistory().length > 0) {
            historySection.style.display = 'block';
        } else {
            historySection.style.display = 'none';
        }
    });
    
    // 初始化清空按钮和历史记录状态
    clearBtn.style.display = 'none';
    historySection.style.display = 'none';
});