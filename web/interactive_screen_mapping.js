FRONTEND_JS = """
import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

app.registerExtension({
    name: "InteractiveScreenMapping",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "InteractiveScreenMapping") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                let canvas = null;
                let ctx = null;
                let points = [];
                let bgImage = null;
                
                // 创建canvas元素
                const createCanvas = () => {
                    if (canvas) return;
                    
                    canvas = document.createElement("canvas");
                    canvas.width = 512;
                    canvas.height = 512;
                    canvas.style.border = "2px solid #333";
                    canvas.style.cursor = "crosshair";
                    canvas.style.display = "block";
                    canvas.style.margin = "5px auto";
                    
                    ctx = canvas.getContext("2d");
                    
                    // 鼠标事件
                    canvas.addEventListener("click", (e) => {
                        if (points.length < 4) {
                            const rect = canvas.getBoundingClientRect();
                            const scaleX = canvas.width / rect.width;
                            const scaleY = canvas.height / rect.height;
                            
                            const x = Math.round((e.clientX - rect.left) * scaleX);
                            const y = Math.round((e.clientY - rect.top) * scaleY);
                            
                            points.push({x: x, y: y});
                            updatePointsWidget();
                            drawCanvas();
                        }
                    });
                    
                    canvas.addEventListener("contextmenu", (e) => {
                        e.preventDefault();
                        if (points.length > 0) {
                            points.pop();
                            updatePointsWidget();
                            drawCanvas();
                        }
                    });
                    
                    canvas.addEventListener("dblclick", (e) => {
                        points = [];
                        updatePointsWidget();
                        drawCanvas();
                    });
                };
                
                // 绘制canvas内容
                const drawCanvas = () => {
                    if (!ctx) return;
                    
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // 绘制背景图像
                    if (bgImage) {
                        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
                    } else {
                        ctx.fillStyle = "#f0f0f0";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    }
                    
                    // 绘制点
                    points.forEach((point, index) => {
                        ctx.fillStyle = "red";
                        ctx.strokeStyle = "white";
                        ctx.lineWidth = 2;
                        
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.stroke();
                        
                        // 绘制标签
                        ctx.fillStyle = "white";
                        ctx.font = "14px Arial";
                        ctx.fillText((index + 1).toString(), point.x + 12, point.y - 8);
                    });
                    
                    // 绘制连线
                    if (points.length > 1) {
                        ctx.strokeStyle = "yellow";
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        
                        points.forEach((point, index) => {
                            if (index === 0) {
                                ctx.moveTo(point.x, point.y);
                            } else {
                                ctx.lineTo(point.x, point.y);
                            }
                        });
                        
                        if (points.length === 4) {
                            ctx.closePath();
                        }
                        
                        ctx.stroke();
                    }
                };
                
                // 更新点坐标widget
                const updatePointsWidget = () => {
                    const pointsWidget = this.widgets.find(w => w.name === "screen_points");
                    if (pointsWidget) {
                        pointsWidget.value = JSON.stringify(points);
                    }
                };
                
                // 添加canvas到节点
                this.addDOMWidget("canvas", "canvas", () => {
                    createCanvas();
                    drawCanvas();
                    return canvas;
                });
                
                // 监听背景图像更新
                this.onExecuted = function(message) {
                    if (message?.bg_image?.[0]) {
                        const img = new Image();
                        img.onload = () => {
                            bgImage = img;
                            if (canvas) {
                                canvas.width = img.width;
                                canvas.height = img.height;
                                drawCanvas();
                            }
                        };
                        img.src = 'data:image/jpeg;base64,' + message.bg_image[0];
                    }
                    
                    if (message?.points?.[0]) {
                        try {
                            points = JSON.parse(message.points[0]);
                            drawCanvas();
                        } catch (e) {
                            console.error("Failed to parse points:", e);
                        }
                    }
                };
                
                return r;
            };
        }
    }
});
"""