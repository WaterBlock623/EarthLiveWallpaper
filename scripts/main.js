// ==================== 配置管理器 ====================
class ConfigManager {
    constructor() {
        this.defaultConfig = {
            resolution: 4,
            imageType: 'D531106',
            zoomLevel: 1,
            zoomToFit: true,
            updateInterval: 10 * 60 * 1000, // 每10分钟更新一次
            maxZoom: 5,
            minZoom: 0.2,
            timeOffset: 30 * 60 * 1000, // 30分钟偏移
            timeAlignment: 10 * 60 * 1000, // 10分钟对齐
            delaySwapGrids: 5000 //延迟5000毫秒等待图片加载
        };
        this.config = { ...this.defaultConfig };
    }

    get(key) {
        return this.config[key];
    }

    set(key, value) {
        if (key in this.config) {
            this.config[key] = value;
            return true;
        }
        return false;
    }

    getAll() {
        return { ...this.config };
    }
}

// ==================== 事件发射器====================
class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    emit(event, ...args) {
        if (this.events[event]) {
            this.events[event].forEach(callback => callback(...args));
        }
    }

    off(event, callback) {
        if (this.events[event]) {
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        }
    }
}

// ==================== 图像源策略接口 ====================
class ImageSourceStrategy {
    getImageUrl(x, y, resolution, imageType, time) {
        throw new Error('getImageUrl method must be implemented');
    }
}

// ==================== Himawari图像源策略 ====================
class HimawariImageSource extends ImageSourceStrategy {
    constructor(config) {
        super();
        this.config = config;
    }

    getImageUrl(x, y, resolution, imageType, time) {
        const dateStr = this.formatDateTime(time);
        return `https://himawari8-dl.nict.go.jp/himawari8/img/${imageType}/${resolution}d/550/${dateStr}00_${x}_${y}.png`;
    }

    formatDateTime(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        return `${year}/${month}/${day}/${hours}${minutes}`;
    }

    calculateImageTime() {
        const now = new Date();
        const timeInMs = now.getTime();
        const alignment = this.config.get('timeAlignment');
        const offset = this.config.get('timeOffset');

        // 对齐到最近的时间间隔并减去偏移
        return new Date(timeInMs - (timeInMs % alignment) - offset);
    }
}

// ==================== 图像网格管理器 ====================
class ImageGridManager {
    constructor(frontGridId, backGridId) {
        this.frontGrid = document.getElementById(frontGridId);
        this.backGrid = document.getElementById(backGridId);
        this.activeGrid = this.frontGrid;
        this.inactiveGrid = this.backGrid;
    }

    createGrid(grid, resolution) {
        grid.innerHTML = '';
        grid.style.gridTemplateColumns = `repeat(${resolution}, 1fr)`;

        const fragment = document.createDocumentFragment();

        for (let y = 0; y < resolution; y++) {
            for (let x = 0; x < resolution; x++) {
                const gridItem = this.createGridItem(x, y);
                fragment.appendChild(gridItem);
            }
        }

        grid.appendChild(fragment);
    }

    createGridItem(x, y) {
        const gridItem = document.createElement('div');
        gridItem.className = 'grid-item';

        const img = document.createElement('img');
        img.dataset.x = x;
        img.dataset.y = y;
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.3s ease';

        gridItem.appendChild(img);
        return gridItem;
    }

    swapGrids() {
        // 切换
        this.activeGrid.style.opacity = '0';
        this.inactiveGrid.style.opacity = '1';

        this.activeGrid.style.zIndex = '0';
        this.inactiveGrid.style.zIndex = '1';

        // 交换引用
        [this.activeGrid, this.inactiveGrid] = [this.inactiveGrid, this.activeGrid];
    }

    getActiveGrid() {
        return this.activeGrid;
    }

    getInactiveGrid() {
        return this.inactiveGrid;
    }

    getActiveGridDimensions() {
        return {
            width: this.activeGrid.scrollWidth,
            height: this.activeGrid.scrollHeight
        };
    }
}

// ==================== 图像加载器 ====================
class ImageLoader extends EventEmitter {
    constructor(imageSource, retryAttempts = 3) {
        super();
        this.imageSource = imageSource;
        this.retryAttempts = retryAttempts;
        this.loadingQueue = [];
    }

    async loadImages(grid, resolution, imageType) {
        const images = grid.querySelectorAll('img');
        const totalCount = resolution * resolution;
        let loadedCount = 0;
        const imageTime = this.imageSource.calculateImageTime();

        const loadPromises = Array.from(images).map((img, index) => {
            const x = index % resolution;
            const y = Math.floor(index / resolution);

            return this.loadImageWithRetry(img, x, y, resolution, imageType, imageTime)
                .then(() => {
                    loadedCount++;
                    this.emit('progress', loadedCount, totalCount);
                })
                .catch(error => {
                    console.error(`Failed to load image at (${x}, ${y}):`, error);
                    this.emit('error', { x, y, error });
                });
        });

        try {
            await Promise.all(loadPromises);
            this.emit('complete', { loadedCount, totalCount });
        } catch (error) {
            this.emit('error', error);
        }
    }

    async loadImageWithRetry(img, x, y, resolution, imageType, imageTime, attempt = 1) {
        try {
            const url = this.imageSource.getImageUrl(x, y, resolution, imageType, imageTime);
            await this.loadImage(img, url);
        } catch (error) {
            if (attempt < this.retryAttempts) {
                await this.delay(1000 * attempt); // 递增延迟
                return this.loadImageWithRetry(img, x, y, resolution, imageType, imageTime, attempt + 1);
            }
            throw error;
        }
    }

    loadImage(img, url) {
        return new Promise((resolve, reject) => {
            const tempImg = new Image();

            tempImg.onload = () => {
                img.src = url;
                setTimeout(() => {
                    img.style.opacity = '1';
                }, 50);
                resolve();
            };

            tempImg.onerror = () => reject(new Error(`Failed to load image from ${url}`));
            tempImg.src = url;
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ==================== 缩放管理器 ====================
class ZoomManager extends EventEmitter {
    constructor(config, wrapper) {
        super();
        this.config = config;
        this.wrapper = wrapper;
    }

    adjustZoom(factor) {
        this.config.set('zoomToFit', false);
        const currentZoom = this.config.get('zoomLevel');
        const newZoom = currentZoom * factor;

        const clampedZoom = this.clampZoom(newZoom);
        this.config.set('zoomLevel', clampedZoom);

        this.applyZoom();
        this.emit('zoomChanged', clampedZoom);
    }

    clampZoom(zoom) {
        const minZoom = this.config.get('minZoom');
        const maxZoom = this.config.get('maxZoom');
        return Math.max(minZoom, Math.min(zoom, maxZoom));
    }

    applyZoom() {
        const zoom = this.config.get('zoomLevel');
        this.wrapper.style.transform = `scale(${zoom})`;
    }

    applySafeZoom(containerDimensions, gridDimensions) {
        const maxScaleX = containerDimensions.width / gridDimensions.width;
        const maxScaleY = containerDimensions.height / gridDimensions.height;
        const maxSafeScale = Math.min(maxScaleX, maxScaleY);

        const currentZoom = this.config.get('zoomLevel');
        if (currentZoom > maxSafeScale) {
            this.config.set('zoomLevel', maxSafeScale);
        }

        this.applyZoom();
    }

    fitToScreen(containerDimensions, gridDimensions) {
        const scaleX = containerDimensions.width / gridDimensions.width;
        const scaleY = containerDimensions.height / gridDimensions.height;

        const fitZoom = Math.min(scaleX, scaleY)
        this.config.set('zoomLevel', fitZoom);
        this.config.set('zoomToFit', true);

        this.applyZoom();
        this.emit('fitToScreen', fitZoom);
    }

    resetZoom() {
        this.config.set('zoomLevel', 1);
        this.config.set('zoomToFit', false);
        this.applyZoom();
        this.emit('zoomReset');
    }
}

// ==================== UI控制器 ====================
class UIController {
    constructor(containerId, wrapperId) {
        this.container = document.querySelector(`.${containerId}`);
        this.wrapper = document.getElementById(wrapperId);
    }

    updateWrapperSize(dimensions) {
        this.wrapper.style.width = `${dimensions.width}px`;
        this.wrapper.style.height = `${dimensions.height}px`;
    }

    getContainerDimensions() {
        return {
            width: this.container.clientWidth,
            height: this.container.clientHeight
        };
    }

    showLoadingIndicator() {
        // 可以实现加载指示器
    }

    hideLoadingIndicator() {
        // 隐藏加载指示器
    }
}

// ==================== 主应用类 ====================
class HimawariViewer extends EventEmitter {
    constructor() {
        super();

        // 初始化组件
        this.config = new ConfigManager();
        this.imageSource = new HimawariImageSource(this.config);
        this.gridManager = new ImageGridManager('image-grid-front', 'image-grid-back');
        this.imageLoader = new ImageLoader(this.imageSource);
        this.ui = new UIController('container', 'image-wrapper');
        this.zoomManager = new ZoomManager(this.config, this.ui.wrapper);

        // 状态
        this.updateTimer = null;
        this.isInitialized = false;

        // 设置事件监听
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 图像加载事件
        this.imageLoader.on('complete', ({ loadedCount, totalCount }) => {
            this.handleLoadComplete(loadedCount, totalCount);
        });

        this.imageLoader.on('progress', (loaded, total) => {
            this.emit('loadProgress', { loaded, total });
        });

        this.imageLoader.on('error', (error) => {
            console.error('Image loading error:', error);
            this.emit('loadError', error);
        });

        // 窗口调整事件
        window.addEventListener('resize', this.debounce(() => {
            this.handleResize();
        }, 300));

        // 缩放事件
        this.zoomManager.on('zoomChanged', (zoom) => {
            this.emit('zoomChanged', zoom);
        });
    }

    async initialize() {
        try {
            const resolution = this.config.get('resolution');
            const imageType = this.config.get('imageType');

            // 创建初始网格
            this.gridManager.createGrid(this.gridManager.getActiveGrid(), resolution);

            // 加载图像
            await this.loadImages(this.gridManager.getActiveGrid());

            // 设置自动更新
            this.startAutoUpdate();

            this.isInitialized = true;
            this.emit('initialized');
        } catch (error) {
            console.error('Initialization failed:', error);
            this.emit('initError', error);
        }
    }

    async loadImages(grid) {
        const resolution = this.config.get('resolution');
        const imageType = this.config.get('imageType');

        this.ui.showLoadingIndicator();

        try {
            await this.imageLoader.loadImages(grid, resolution, imageType);
        } finally {
            this.ui.hideLoadingIndicator();
        }
    }

    handleLoadComplete(loadedCount, totalCount) {
        const dimensions = this.gridManager.getActiveGridDimensions();
        this.ui.updateWrapperSize(dimensions);

        if (!this.isInitialized) {
            // 初始加载
            if (this.config.get('zoomToFit')) {
                this.fitToScreen();
            }
        } else {
            // 后台更新完成
            setTimeout(() => {
                this.gridManager.swapGrids();
                if (this.config.get('zoomToFit')) {
                    this.fitToScreen();
                }
            }, this.config.get('delaySwapGrids'));
        }
    }

    async updateImages() {
        const inactiveGrid = this.gridManager.getInactiveGrid();
        const resolution = this.config.get('resolution');

        // 创建新网格
        this.gridManager.createGrid(inactiveGrid, resolution);

        // 加载图像
        await this.loadImages(inactiveGrid);
    }

    startAutoUpdate() {
        const interval = this.config.get('updateInterval');
        this.updateTimer = setInterval(() => {
            this.updateImages().catch(error => {
                console.error('Auto update failed:', error);
                this.emit('updateError', error);
            });
        }, interval);
    }

    stopAutoUpdate() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    handleResize() {
        const containerDimensions = this.ui.getContainerDimensions();
        const gridDimensions = this.gridManager.getActiveGridDimensions();

        if (this.config.get('zoomToFit')) {
            this.zoomManager.fitToScreen(containerDimensions, gridDimensions);
        } else {
            this.zoomManager.applySafeZoom(containerDimensions, gridDimensions);
        }
    }

    // 公共API方法
    adjustZoom(factor) {
        this.zoomManager.adjustZoom(factor);
    }

    fitToScreen() {
        const containerDimensions = this.ui.getContainerDimensions();
        const gridDimensions = this.gridManager.getActiveGridDimensions();
        this.zoomManager.fitToScreen(containerDimensions, gridDimensions);
    }

    resetZoom() {
        this.zoomManager.resetZoom();
    }

    setResolution(resolution) {
        if (resolution !== this.config.get('resolution')) {
            this.config.set('resolution', resolution);
            this.updateImages();
        }
    }

    // 工具方法
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 清理资源
    destroy() {
        this.stopAutoUpdate();
        window.removeEventListener('resize', this.handleResize);
        this.emit('destroyed');
    }
}

// ==================== 应用初始化 ====================
let viewer;

document.addEventListener('DOMContentLoaded', () => {
    viewer = new HimawariViewer();

    // 监听应用事件
    viewer.on('initialized', () => {
        console.log('Himawari Viewer initialized successfully');
    });

    viewer.on('loadProgress', ({ loaded, total }) => {
        console.log(`Loading progress: ${loaded}/${total}`);
    });

    viewer.on('zoomChanged', (zoom) => {
        console.log(`Zoom level: ${zoom.toFixed(2)}`);
    });

    // 初始化应用
    viewer.initialize();
});

// 导出全局控制函数
// window.adjustZoom = (factor) => viewer?.adjustZoom(factor);
// window.fitToScreen = () => viewer?.fitToScreen();
// window.resetZoom = () => viewer?.resetZoom();