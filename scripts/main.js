// 配置参数
const config = {
    resolution: 4, // 默认分辨率
    imageType: 'D531106', // 图像类型（真彩色）
    zoomLevel: 1, // 缩放级别
    zoomToFit: true // 是否缩放到适应屏幕
};

// 获取DOM元素
const imageGrid = document.getElementById('image-grid');
const imageWrapper = document.getElementById('image-wrapper');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 加载图像
    createImageGrid(config.resolution, config.imageType);

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);
});

// 获取Himawari图像URL
function getHimawariUrl(d, x, y, imageType) {
    // 计算图像时间（当前UTC时间减去余数和对齐，再减去30分钟）
    const now = new Date();
    const timeInMs = now.getTime();
    const tenMinutesInMs = 10 * 60 * 1000;

    // 对齐到最近的10分钟并减去30分钟
    const imageTime = new Date(timeInMs - (timeInMs % tenMinutesInMs) - 30 * 60 * 1000);

    // 格式化为YYYY/MM/DD/HHmm
    const year = imageTime.getUTCFullYear();
    const month = String(imageTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(imageTime.getUTCDate()).padStart(2, '0');
    // const hours = String(imageTime.getUTCHours()).padStart(2, '0');
    const hours = "04"
    const minutes = String(imageTime.getUTCMinutes()).padStart(2, '0');

    const dateStr = `${year}/${month}/${day}/${hours}${minutes}`;

    // 构建URL
    return `https://himawari8-dl.nict.go.jp/himawari8/img/${imageType}/${d}d/550/${dateStr}00_${x}_${y}.png`;
}

// 创建图像网格
function createImageGrid(d, imageType) {

    // 清除现有内容
    imageGrid.innerHTML = '';

    // 设置CSS Grid布局
    imageGrid.style.gridTemplateColumns = `repeat(${d}, 1fr)`;

    // 创建网格项目
    for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) {
            const gridItem = document.createElement('div');
            gridItem.className = 'grid-item';

            const img = document.createElement('img');
            img.dataset.x = j;
            img.dataset.y = i;

            gridItem.appendChild(img);
            imageGrid.appendChild(gridItem);
        }

    }

    // 预加载所有图像
    preloadImages(d, imageType);
}

// 预加载图像
function preloadImages(d, imageType) {
    let loadedCount = 0;
    const totalCount = d * d;

    // 更新加载状态
    const updateLoadingStatus = () => {
        loadedCount++;
        if (loadedCount === totalCount) {
            // 所有图像加载完成
            // 如果设置为适应屏幕，则应用缩放
            if (config.zoomToFit) {
                fitToScreen();
            }
        }
    };

    // 遍历所有网格项目并加载图像
    for (let i = 0; i < d; i++) {
        for (let j = 0; j < d; j++) {
            const img = new Image();
            img.onload = () => {
                // 找到对应的img元素并设置src
                const gridImg = document.querySelector(`.grid-item img[data-x="${j}"][data-y="${i}"]`);
                if (gridImg) {
                    gridImg.src = img.src;
                    setTimeout(() => {
                        gridImg.style.opacity = '1';
                    }, 50);
                }
                updateLoadingStatus();
            };

            img.onerror = () => {
                console.error(`无法加载图像片段: x=${j}, y=${i}`);
                updateLoadingStatus();
            };

            img.src = getHimawariUrl(d, j, i, imageType);
        }
    }
}

// 调整缩放级别（确保图片不被裁剪）
function adjustZoom(factor) {
    config.zoomToFit = false;
    config.zoomLevel *= factor;

    // 限制最小和最大缩放
    config.zoomLevel = Math.max(0.2, Math.min(config.zoomLevel, 5));

    // 应用缩放
    applySafeZoom();
}

// 应用安全的缩放（确保图片不被裁剪）
function applySafeZoom() {
    const container = document.querySelector('.container');
    const gridWidth = imageGrid.scrollWidth;
    const gridHeight = imageGrid.scrollHeight;

    // 计算最大安全缩放比例
    const maxScaleX = container.clientWidth / gridWidth;
    const maxScaleY = container.clientHeight / gridHeight;
    const maxSafeScale = Math.min(maxScaleX, maxScaleY);

    // 如果当前缩放比例大于安全比例，则使用安全比例
    if (config.zoomLevel > maxSafeScale) {
        config.zoomLevel = maxSafeScale;
    }

    imageGrid.style.transform = `scale(${config.zoomLevel})`;
}

// 切换适应屏幕模式
function toggleFitToScreen() {
    config.zoomToFit = !config.zoomToFit;

    if (config.zoomToFit) {
        fitToScreen();
        zoomFitBtn.textContent = "原始";
        fitIndicator.textContent = "适应屏幕: 开启";
    } else {
        resetZoom();
        zoomFitBtn.textContent = "1:1";
        fitIndicator.textContent = "适应屏幕: 关闭";
    }
}

// 适应屏幕（确保图片不被裁剪）
function fitToScreen() {
    const container = document.querySelector('.container');
    const gridWidth = imageGrid.scrollWidth;
    const gridHeight = imageGrid.scrollHeight;

    const scaleX = container.clientWidth / gridWidth;
    const scaleY = container.clientHeight / gridHeight;

    // 取最小比例以确保整个图像可见
    config.zoomLevel = Math.min(scaleX, scaleY);

    imageGrid.style.transform = `scale(${config.zoomLevel})`;
}

// 重置缩放
function resetZoom() {
    config.zoomLevel = 1;
    imageGrid.style.transform = 'scale(1)';
}

// 处理窗口大小变化
function handleResize() {
    if (config.zoomToFit) {
        fitToScreen();
    } else {
        applySafeZoom();
    }
}

// 初始加载
createImageGrid(config.resolution, config.imageType);
