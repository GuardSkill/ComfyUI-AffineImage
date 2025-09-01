import { app } from '../../../scripts/app.js'

// 工具函数
export function makeUUID() {
  let dt = new Date().getTime()
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = ((dt + Math.random() * 16) % 16) | 0
    dt = Math.floor(dt / 16)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
  return uuid
}

export const loadScript = (
  FILE_URL,
  async = true,
  type = 'text/javascript',
) => {
  return new Promise((resolve, reject) => {
    try {
      const existingScript = document.querySelector(`script[src="${FILE_URL}"]`)
      if (existingScript) {
        resolve({ status: true, message: 'Script already loaded' })
        return
      }

      const scriptEle = document.createElement('script')
      scriptEle.type = type
      scriptEle.async = async
      scriptEle.src = FILE_URL

      scriptEle.addEventListener('load', (ev) => {
        resolve({ status: true })
      })

      scriptEle.addEventListener('error', (ev) => {
        reject({
          status: false,
          message: `Failed to load the script ${FILE_URL}`,
        })
      })

      document.body.appendChild(scriptEle)
    } catch (error) {
      reject(error)
    }
  })
}

// 创建样式表
const create_screen_mapper_stylesheet = () => {
  const tag = 'screen-mapper-unified-stylesheet'

  let styleTag = document.head.querySelector('#' + tag)

  if (!styleTag) {
    styleTag = document.createElement('style')
    styleTag.type = 'text/css'
    styleTag.id = tag
    styleTag.innerHTML = `
       .four-point-selector {
        position: absolute;
        font: 12px monospace;
        line-height: 1.5em;
        padding: 10px;
        z-index: 0;
        overflow: hidden;
       }
       .point-status-indicator {
        position: absolute;
        top: 5px;
        right: 5px;
        background: rgba(0,0,0,0.8);
        color: #fff;
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        z-index: 10;
       }
       .point-instructions {
        position: absolute;
        bottom: 5px;
        left: 5px;
        background: rgba(0,0,0,0.7);
        color: #fff;
        padding: 5px;
        border-radius: 3px;
        font-size: 11px;
        max-width: 200px;
        z-index: 10;
       }
        `
    document.head.appendChild(styleTag)
  }
}

// 加载必要的库
loadScript('kjweb_async/svg-path-properties.min.js').catch((e) => {
  console.log('SVG路径库加载失败:', e)
})
loadScript('kjweb_async/protovis.min.js').catch((e) => {
  console.log('Protovis库加载失败:', e)
})
create_screen_mapper_stylesheet()

function chainCallback(object, property, callback) {
  if (object == undefined) {
    console.error("Tried to add callback to non-existant object")
    return;
  }
  if (property in object) {
    const callback_orig = object[property]
    object[property] = function () {
      const r = callback_orig.apply(this, arguments);
      callback.apply(this, arguments);
      return r
    };
  } else {
    object[property] = callback;
  }
}

// 注册Canvas四点选择器扩展
app.registerExtension({
  name: 'ScreenMapper.CanvasFourPointSelector',

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name === 'CanvasFourPointSelector') {
      chainCallback(nodeType.prototype, "onNodeCreated", function () {

        // 隐藏坐标相关的widget
        hideWidgetForGood(this, this.widgets.find(w => w.name === "coordinates"))
        hideWidgetForGood(this, this.widgets.find(w => w.name === "points_store"))

        var element = document.createElement("div");
        this.uuid = makeUUID()
        element.id = `four-point-selector-${this.uuid}`

        this.previewMediaType = 'image'

        this.fourPointSelector = this.addDOMWidget(nodeData.name, "FourPointSelectorWidget", element, {
          serialize: false,
          hideOnZoom: false,
        });

        // 创建上下文菜单
        this.contextMenu = document.createElement("div");
        this.contextMenu.id = "context-menu-fourpoint";
        this.contextMenu.style.display = "none";
        this.contextMenu.style.position = "absolute";
        this.contextMenu.style.backgroundColor = "#202020";
        this.contextMenu.style.minWidth = "120px";
        this.contextMenu.style.boxShadow = "0px 8px 16px 0px rgba(0,0,0,0.2)";
        this.contextMenu.style.zIndex = "1000";
        this.contextMenu.style.padding = "5px";
        this.contextMenu.style.borderRadius = "3px";

        function styleMenuItem(menuItem) {
          menuItem.style.display = "block";
          menuItem.style.padding = "8px 12px";
          menuItem.style.color = "#FFF";
          menuItem.style.fontFamily = "Arial, sans-serif";
          menuItem.style.fontSize = "13px";
          menuItem.style.textDecoration = "none";
          menuItem.style.marginBottom = "2px";
          menuItem.style.borderRadius = "2px";
          menuItem.style.cursor = "pointer";
        }
        
        function createMenuItem(id, textContent) {
          let menuItem = document.createElement("a");
          menuItem.href = "#";
          menuItem.id = `menu-item-fourpoint-${id}`;
          menuItem.textContent = textContent;
          styleMenuItem(menuItem);
          return menuItem;
        }

        // 创建菜单项
        this.menuItems = [
          createMenuItem(0, "加载图像"),
          createMenuItem(1, "清除图像"),
          createMenuItem(2, "重置角点"),
          createMenuItem(3, "设为默认角点"),
        ];

        // 添加鼠标悬停效果
        this.menuItems.forEach(menuItem => {
          menuItem.addEventListener('mouseover', function () {
            this.style.backgroundColor = "#404040";
          });

          menuItem.addEventListener('mouseout', function () {
            this.style.backgroundColor = "transparent";
          });
        });

        // 添加菜单项到上下文菜单
        this.menuItems.forEach(menuItem => {
          this.contextMenu.appendChild(menuItem);
        });

        document.body.appendChild(this.contextMenu);

        // 添加新建Canvas按钮
        this.addWidget("button", "新建Canvas", null, () => {
          if (!this.properties || !("four_points" in this.properties)) {
            this.editor = new FourPointSelector(this);
            this.addProperty("four_points", this.constructor.type, "string");
          }
          else {
            this.editor = new FourPointSelector(this, true);
          }
        });

        this.setSize([600, 600]);
        this.resizable = false;
        this.fourPointSelector.parentEl = document.createElement("div");
        this.fourPointSelector.parentEl.className = "four-point-selector";
        this.fourPointSelector.parentEl.id = `four-point-selector-${this.uuid}`
        element.appendChild(this.fourPointSelector.parentEl);

        chainCallback(this, "onConfigure", function () {
          try {
            this.editor = new FourPointSelector(this);
          } catch (error) {
            console.error("配置四点选择器时出错:", error);
          }
        });
        
        chainCallback(this, "onExecuted", function (message) {
          let bg_image = message["bg_image"];
          this.properties.imgData = {
            name: "reference_image",
            base64: bg_image
          };
          if (this.editor) {
            this.editor.refreshBackgroundImage(this);
          }
        });

      }); // onNodeCreated
    }//node created
  } //before register
})//register

// 注册透视变换映射器扩展（简单版，主要处理数据）
app.registerExtension({
  name: 'ScreenMapper.PerspectiveScreenMapper',

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name === 'PerspectiveScreenMapper') {
      chainCallback(nodeType.prototype, "onNodeCreated", function () {
        // 这个节点主要是处理数据，不需要复杂的UI
        console.log("透视变换映射器节点已创建");
      });
    }
  }
})

// 四点选择器类
class FourPointSelector {
  constructor(context, reset = false) {
    this.node = context;
    this.reset = reset;
    const self = this;

    console.log("创建四点选择器")

    // 文件处理
    this.node.pasteFile = (file) => {
      if (file.type.startsWith("image/")) {
        this.handleImageFile(file);
        return true;
      }
      return false;
    };

    this.node.onDragOver = function (e) {
      if (e.dataTransfer && e.dataTransfer.items) {
        return [...e.dataTransfer.items].some(f => f.kind === "file" && f.type.startsWith("image/"));
      }
      return false;
    };

    this.node.onDragDrop = (e) => {
      console.log("拖拽文件");
      let handled = false;
      for (const file of e.dataTransfer.files) {
        if (file.type.startsWith("image/")) {
          this.handleImageFile(file);
          handled = true;
        }
      }
      return handled;
    };

    // 创建上下文菜单功能
    this.createContextMenu();

    if (reset && context.fourPointSelector.element) {
      context.fourPointSelector.element.innerHTML = '';
    }

    // Widget引用
    this.coordWidget = context.widgets.find(w => w.name === "coordinates");
    this.pointsStoreWidget = context.widgets.find(w => w.name === "points_store");
    this.widthWidget = context.widgets.find(w => w.name === "width");
    this.heightWidget = context.widgets.find(w => w.name === "height");

    // Widget回调
    this.widthWidget.callback = () => {
      this.width = this.widthWidget.value;
      if (this.width > 256) {
        context.setSize([this.width + 45, context.size[1]]);
      }
      if (this.vis) {
        this.vis.width(this.width);
        this.updateData();
      }
    }

    this.heightWidget.callback = () => {
      this.height = this.heightWidget.value
      if (this.vis) {
        this.vis.height(this.height)
      }
      context.setSize([context.size[0], this.height + 250]);
      this.updateData();
    }

    this.pointsStoreWidget.callback = () => {
      try {
        this.four_points = JSON.parse(this.pointsStoreWidget.value);
        this.updateData();
      } catch (e) {
        console.log("解析存储点失败:", e);
      }
    }

    this.width = this.widthWidget.value;
    this.height = this.heightWidget.value;
    var i = 0;
    this.four_points = [];
    this.maxPoints = 4; // 限制最多4个点

    // 初始化四个点
    if (!reset && this.pointsStoreWidget.value != "") {
      try {
        this.four_points = JSON.parse(this.pointsStoreWidget.value);
      } catch (e) {
        this.four_points = [];
      }
    }
    
    // 如果没有点或点数不足，初始化默认四个角点
    if (this.four_points.length === 0) {
      this.four_points = [
        { x: this.width * 0.15, y: this.height * 0.15 }, // 左上
        { x: this.width * 0.85, y: this.height * 0.15 }, // 右上
        { x: this.width * 0.85, y: this.height * 0.85 }, // 右下
        { x: this.width * 0.15, y: this.height * 0.85 }  // 左下
      ];
      this.pointsStoreWidget.value = JSON.stringify(this.four_points);
    }

    // 创建主Canvas面板
    this.vis = new pv.Panel()
      .width(this.width)
      .height(this.height)
      .fillStyle("#222")
      .strokeStyle("gray")
      .lineWidth(2)
      .antialias(false)
      .margin(10)
      .event("mousedown", function () { 
        if (pv.event.shiftKey) {
          // 只有在点数少于4个时才能添加新点
          if (self.four_points.length < self.maxPoints) {
            let scaledMouse = {
              x: this.mouse().x / app.canvas.ds.scale,
              y: this.mouse().y / app.canvas.ds.scale
            };
            i = self.four_points.push(scaledMouse) - 1;
            self.updateData();
            self.updatePointIndicator();
          }
          return this;
        }
        else if (pv.event.button === 2) {
          self.node.contextMenu.style.display = 'block';
          self.node.contextMenu.style.left = `${pv.event.clientX}px`;
          self.node.contextMenu.style.top = `${pv.event.clientY}px`;
        }
      });

    this.backgroundImage = this.vis.add(pv.Image).visible(false)

    // 创建连接线显示四个角点形成的四边形
    this.connectionLines = this.vis.add(pv.Line)
      .data(function() {
        if (self.four_points.length >= 4) {
          // 返回四个角点加上第一个点以闭合图形
          return [...self.four_points.slice(0, 4), self.four_points[0]];
        }
        return [];
      })
      .left(d => d.x)
      .top(d => d.y)
      .strokeStyle("rgba(255, 255, 0, 0.8)")
      .lineWidth(2)
      .visible(function() { return self.four_points.length >= 4; });

    // 创建屏幕角点
    this.vis.add(pv.Dot)
      .data(() => this.four_points.slice(0, this.maxPoints))
      .left(d => d.x)
      .top(d => d.y)
      .radius(Math.log(Math.min(self.width, self.height)) * 4)
      .shape("circle")
      .cursor("move")
      .strokeStyle(function () { 
        const colors = ["#07f907", "#f907f9", "#f90707", "#0707f9"]; // 不同颜色区分四个角点
        return i == this.index ? colors[this.index % 4] : "#666";
      })
      .lineWidth(4)
      .fillStyle(function () { 
        return i == this.index ? "rgba(255, 255, 255, 0.8)" : "rgba(100, 100, 100, 0.6)"; 
      })
      .event("mousedown", pv.Behavior.drag())
      .event("dragstart", function () {
        i = this.index;
      })
      .event("dragend", function () {
        // 右键删除点（但至少保留1个点）
        if (pv.event.button === 2 && self.four_points.length > 1) {
          self.four_points.splice(this.index, 1);
        }
        self.updateData();
        self.updatePointIndicator();
      })
      .event("drag", function () {
        let adjustedX = this.mouse().x / app.canvas.ds.scale;
        let adjustedY = this.mouse().y / app.canvas.ds.scale;
        
        // 限制在画布范围内
        const panelWidth = self.vis.width();
        const panelHeight = self.vis.height();
        adjustedX = Math.max(0, Math.min(panelWidth, adjustedX));
        adjustedY = Math.max(0, Math.min(panelHeight, adjustedY));
        
        self.four_points[this.index] = { x: adjustedX, y: adjustedY };
        self.vis.render();
      })
      .anchor("center")
      .add(pv.Label)
      .left(d => d.x < this.width / 2 ? d.x + 30 : d.x - 35)
      .top(d => d.y < this.height / 2 ? d.y + 25 : d.y - 25)
      .font(14 + "px sans-serif")
      .text(function(d) {
        const labels = ["左上", "右上", "右下", "左下"];
        return labels[this.index] || `点${this.index + 1}`;
      })
      .textStyle("#fff")
      .textShadow("2px 2px 2px black")
      .add(pv.Dot) // 中心小点
      .data(() => this.four_points.slice(0, this.maxPoints))
        .left(d => d.x)
        .top(d => d.y)
        .radius(3)
        .shape("circle")
        .fillStyle("red")
        .lineWidth(1);

    // 创建状态指示器
    this.createPointIndicator();
    this.createInstructions();

    if (this.four_points.length != 0) {
      this.vis.render();
    }

    var svgElement = this.vis.canvas();
    svgElement.style['zIndex'] = "2"
    svgElement.style['position'] = "relative"
    this.node.fourPointSelector.element.appendChild(svgElement);

    if (this.width > 256) {
      this.node.setSize([this.width + 45, this.node.size[1]]);
    }
    this.node.setSize([this.node.size[0], this.height + 250]);
    this.updateData();
    this.refreshBackgroundImage();
    this.updatePointIndicator();

  }//end constructor

  // 创建四点状态指示器
  createPointIndicator = () => {
    this.pointIndicator = document.createElement("div");
    this.pointIndicator.className = "point-status-indicator";
    this.node.fourPointSelector.element.appendChild(this.pointIndicator);
  }

  // 创建操作说明
  createInstructions = () => {
    this.instructions = document.createElement("div");
    this.instructions.className = "point-instructions";
    this.instructions.innerHTML = "Shift+点击: 添加点<br>拖拽: 调整位置<br>右键点: 删除点";
    this.node.fourPointSelector.element.appendChild(this.instructions);
  }

  // 更新四点状态指示器
  updatePointIndicator = () => {
    if (this.pointIndicator) {
      const count = Math.min(this.four_points.length, 4);
      const status = count === 4 ? "✅ 准备映射" : `需要${4-count}个点`;
      this.pointIndicator.textContent = `屏幕角点: ${count}/4 ${status}`;
      this.pointIndicator.style.backgroundColor = count === 4 ? "rgba(0,128,0,0.8)" : "rgba(128,0,0,0.8)";
    }
  }

  updateData = () => {
    if (!this.four_points || this.four_points.length === 0) {
      console.log("无屏幕角点");
      return;
    }
    
    // 只保存前4个点用于屏幕映射
    const mappingPoints = this.four_points.slice(0, this.maxPoints);
    
    this.pointsStoreWidget.value = JSON.stringify(this.four_points);
    this.coordWidget.value = JSON.stringify(mappingPoints);
    
    if (this.vis) {
      this.vis.render();
    }
  };

  // 重置为默认四个角点
  resetToDefaultPoints = () => {
    this.four_points = [
      { x: this.width * 0.15, y: this.height * 0.15 }, // 左上
      { x: this.width * 0.85, y: this.height * 0.15 }, // 右上  
      { x: this.width * 0.85, y: this.height * 0.85 }, // 右下
      { x: this.width * 0.15, y: this.height * 0.85 }  // 左下
    ];
    this.updateData();
    this.updatePointIndicator();
  };

  handleImageLoad = (img, file, base64String) => {
    console.log("图像加载:", img.width, img.height);
    this.widthWidget.value = img.width;
    this.heightWidget.value = img.height;

    if (img.width != this.vis.width() || img.height != this.vis.height()) {
      if (img.width > 256) {
        this.node.setSize([img.width + 45, this.node.size[1]]);
      }
      this.node.setSize([this.node.size[0], img.height + 250]);
      this.vis.width(img.width);
      this.vis.height(img.height);
      this.height = img.height;
      this.width = img.width;
      
      // 当图像尺寸改变时，重置角点到新的默认位置
      this.resetToDefaultPoints();
    }
    this.backgroundImage.url(file ? URL.createObjectURL(file) : `data:${this.node.properties.imgData.type};base64,${base64String}`).visible(true).root.render();
  };

  processImage = (img, file) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const maxWidth = 1024;
    const maxHeight = 768;
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > maxWidth) {
        height *= maxWidth / width;
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width *= maxHeight / height;
        height = maxHeight;
      }
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    const base64String = canvas.toDataURL('image/jpeg', 0.8).replace('data:', '').replace(/^.+,/, '');

    this.node.properties.imgData = {
      name: file.name,
      lastModified: file.lastModified,
      size: file.size,
      type: file.type,
      base64: base64String
    };
    this.handleImageLoad(img, file, base64String);
  };

  handleImageFile = (file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.src = reader.result;
      img.onload = () => this.processImage(img, file);
    };
    reader.readAsDataURL(file);

    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => this.handleImageLoad(img, file, null);
  };

  refreshBackgroundImage = () => {
    if (this.node.properties.imgData && this.node.properties.imgData.base64) {
      const base64String = this.node.properties.imgData.base64;
      const imageUrl = `data:${this.node.properties.imgData.type};base64,${base64String}`;
      const img = new Image();
      img.src = imageUrl;
      img.onload = () => this.handleImageLoad(img, null, base64String);
    }
  };

  createContextMenu = () => {
    const self = this;
    document.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    document.addEventListener('click', function (e) {
      if (!self.node.contextMenu.contains(e.target)) {
        self.node.contextMenu.style.display = 'none';
      }
    });

    this.node.menuItems.forEach((menuItem, index) => {
      menuItem.addEventListener('click', function (e) {
        e.preventDefault();
        switch (index) {
          case 0: // 加载图像
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';

            fileInput.addEventListener('change', function (event) {
              const file = event.target.files[0];
              if (file) {
                const imageUrl = URL.createObjectURL(file);
                let img = new Image();
                img.src = imageUrl;
                img.onload = () => self.handleImageLoad(img, file, null);
              }
            });

            fileInput.click();
            self.node.contextMenu.style.display = 'none';
            break;
          case 1: // 清除图像
            self.backgroundImage.visible(false).root.render();
            self.node.properties.imgData = null;
            self.node.contextMenu.style.display = 'none';
            break;
          case 2: // 重置角点
            self.resetToDefaultPoints();
            self.node.contextMenu.style.display = 'none';
            break;
          case 3: // 设为默认角点
            // 将当前四个点设为默认值（如果有4个点的话）
            if (self.four_points.length === 4) {
              console.log("当前四个点已设为默认");
            }
            self.node.contextMenu.style.display = 'none';
            break;
        }
      });
    });
  }//end createContextMenu
}//end class

// 隐藏widget工具函数
export function hideWidgetForGood(node, widget, suffix = '') {
  if (!widget) return;
  
  widget.origType = widget.type
  widget.origComputeSize = widget.computeSize
  widget.origSerializeValue = widget.serializeValue
  widget.computeSize = () => [0, -4]
  widget.type = "converted-widget" + suffix

  // 隐藏关联的widgets
  if (widget.linkedWidgets) {
    for (const w of widget.linkedWidgets) {
      hideWidgetForGood(node, w, ':' + widget.name)
    }
  }
}