# ========================================
# Python节点代码 (screen_mapper_nodes.py)
# ========================================

import torch
import numpy as np
import cv2
from PIL import Image
import base64
import io
import json
from torchvision import transforms

# ========================================
# 节点1: Canvas四点选择器 (只负责选点)
# ========================================

class CanvasFourPointSelector:
    """
    ComfyUI节点：使用Canvas交互式选择四个角点
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "reference_image": ("IMAGE",),  # 参考图像，用于Canvas显示
                "points_store": ("STRING", {"multiline": False, "default": "[]"}),
                "coordinates": ("STRING", {"multiline": False, "default": "[]"}),
                "width": ("INT", {"default": 512, "min": 8, "max": 4096, "step": 8}),
                "height": ("INT", {"default": 512, "min": 8, "max": 4096, "step": 8}),
            },
            "optional": {
                "normalize": ("BOOLEAN", {"default": False}),
            }
        }
    
    RETURN_TYPES = ("STRING", "STRING", "MASK", "IMAGE")
    RETURN_NAMES = ("four_points", "point_info", "selection_mask", "reference_image")
    FUNCTION = "select_four_points"
    CATEGORY = "KJNodes/experimental"
    DESCRIPTION = """
# Canvas四点选择器

**专门用于在图像上选择四个角点：**

**操作方式：**
- **Shift + 点击** 添加角点（最多4个）
- **拖拽点** 调整位置
- **右键点击点** 删除该点
- 拖拽图像到节点背景

**点击顺序建议：** 左上 → 右上 → 右下 → 左下

**输出四个点坐标供后续节点使用**
"""

    def parse_coordinates(self, coordinates):
        """解析坐标JSON字符串"""
        try:
            if not coordinates or coordinates.strip() == "":
                return []
            
            coords_data = json.loads(coordinates)
            processed_coords = []
            
            for coord in coords_data:
                if isinstance(coord, dict):
                    # KJNodes格式: {"x": 100, "y": 200}
                    x = int(round(coord.get('x', 0)))
                    y = int(round(coord.get('y', 0)))
                    processed_coords.append([x, y])
                elif isinstance(coord, (list, tuple)) and len(coord) >= 2:
                    # 数组格式: [100, 200]
                    x = int(round(coord[0]))
                    y = int(round(coord[1]))
                    processed_coords.append([x, y])
            
            return processed_coords
        except Exception as e:
            print(f"坐标解析错误: {e}")
            return []

    def create_selection_mask(self, points, img_height, img_width):
        """创建选择区域的遮罩"""
        mask = np.zeros((img_height, img_width), dtype=np.uint8)
        
        if len(points) >= 4:
            # 使用前4个点创建多边形遮罩
            pts = np.array(points[:4], dtype=np.int32)
            cv2.fillPoly(mask, [pts], 255)
        
        mask_tensor = torch.from_numpy(mask).float().unsqueeze(0) / 255.0
        return mask_tensor

    def select_four_points(self, reference_image, points_store, coordinates, width, height, normalize=False):
        
        # 解析坐标
        screen_points = self.parse_coordinates(coordinates)
        
        # 获取图像尺寸
        if len(reference_image.shape) == 4:
            img_tensor = reference_image[0]
        else:
            img_tensor = reference_image
            
        img_height, img_width = img_tensor.shape[:2]
        
        # 处理坐标归一化
        if normalize and screen_points:
            for point in screen_points:
                point[0] = int(point[0] * img_width / width)
                point[1] = int(point[1] * img_height / height)
        
        # 限制坐标在图像范围内
        for point in screen_points:
            point[0] = max(0, min(point[0], img_width))
            point[1] = max(0, min(point[1], img_height))
        
        # 生成点信息
        point_labels = ["左上", "右上", "右下", "左下"]
        point_info_list = []
        
        for i, point in enumerate(screen_points[:4]):
            label = point_labels[i] if i < len(point_labels) else f"点{i+1}"
            point_info_list.append(f"{label}: ({point[0]}, {point[1]})")
        
        point_info = " | ".join(point_info_list) if point_info_list else "未选择任何点"
        
        # 创建选择区域遮罩
        selection_mask = self.create_selection_mask(screen_points, img_height, img_width)
        
        # 输出四个点的坐标（JSON格式）
        four_points_json = json.dumps(screen_points[:4])
        
        # 生成用于Canvas显示的base64图像
        if reference_image is not None:
            transform = transforms.ToPILImage()
            ref_pil = transform(reference_image[0].permute(2, 0, 1))
            buffered = io.BytesIO()
            ref_pil.save(buffered, format="JPEG", quality=85)
            img_bytes = buffered.getvalue()
            img_base64 = base64.b64encode(img_bytes).decode('utf-8')
            
            return {
                "ui": {"bg_image": [img_base64]},
                "result": (four_points_json, point_info, selection_mask, reference_image)
            }
        else:
            return (four_points_json, point_info, selection_mask, reference_image)

# ========================================
# 节点2: 透视变换映射器 (只负责变换)
# ========================================

class PerspectiveScreenMapper:
    """
    ComfyUI节点：使用四个点坐标执行透视变换映射
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "background_image": ("IMAGE",),  # 背景图像
                "source_image": ("IMAGE",),      # 要映射的源图像
                "four_points": ("STRING", {"multiline": False}),  # 从选择器节点接收的四个点
            },
            "optional": {
                "blend_mode": (["replace", "overlay", "multiply", "screen"], {"default": "replace"}),
                "opacity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "crop_to_screen": ("BOOLEAN", {"default": True}),
            }
        }
    
    RETURN_TYPES = ("IMAGE", "IMAGE", "MASK")
    RETURN_NAMES = ("mapped_image", "cropped_screen", "screen_mask")
    FUNCTION = "apply_perspective_mapping"
    CATEGORY = "ImageNodes"
    DESCRIPTION = """
# 透视变换屏幕映射器

**使用四个角点执行透视变换：**

**输入：**
- 背景图像：包含屏幕的图像
- 源图像：要映射到屏幕的内容
- 四个点：从Canvas选择器获得的角点坐标

**输出：**
- 映射后的完整图像
- 裁剪的屏幕区域
- 屏幕区域遮罩

**混合模式：** replace, overlay, multiply, screen
"""

    def tensor_to_cv2(self, tensor_image):
        """将ComfyUI tensor转换为OpenCV格式"""
        if len(tensor_image.shape) == 4:
            tensor_image = tensor_image[0]
        
        np_image = (tensor_image.cpu().numpy() * 255).astype(np.uint8)
        
        if np_image.shape[2] == 3:
            cv2_image = cv2.cvtColor(np_image, cv2.COLOR_RGB2BGR)
        else:
            cv2_image = cv2.cvtColor(np_image, cv2.COLOR_RGBA2BGR)
        
        return cv2_image
    
    def cv2_to_tensor(self, cv2_image):
        """将OpenCV格式转换为ComfyUI tensor"""
        rgb_image = cv2.cvtColor(cv2_image, cv2.COLOR_BGR2RGB)
        tensor_image = torch.from_numpy(rgb_image.astype(np.float32) / 255.0)
        tensor_image = tensor_image.unsqueeze(0)
        return tensor_image

    def parse_four_points(self, four_points_json):
        """解析四个点的坐标"""
        try:
            if not four_points_json or four_points_json.strip() == "":
                return []
            
            points = json.loads(four_points_json)
            processed_points = []
            
            for point in points:
                if isinstance(point, dict):
                    x = int(round(point.get('x', 0)))
                    y = int(round(point.get('y', 0)))
                    processed_points.append([x, y])
                elif isinstance(point, (list, tuple)) and len(point) >= 2:
                    x = int(round(point[0]))
                    y = int(round(point[1]))
                    processed_points.append([x, y])
            
            return processed_points[:4]  # 只取前4个点
        except Exception as e:
            print(f"四点坐标解析错误: {e}")
            return []

    def get_screen_bbox(self, points):
        """获取屏幕区域的外接矩形"""
        if len(points) < 4:
            return None
            
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        
        x_min = int(min(xs))
        y_min = int(min(ys))
        x_max = int(max(xs))
        y_max = int(max(ys))
        
        return (x_min, y_min, x_max, y_max)

    def create_screen_mask(self, points, img_height, img_width):
        """创建屏幕区域的遮罩"""
        mask = np.zeros((img_height, img_width), dtype=np.uint8)
        
        if len(points) >= 4:
            pts = np.array(points[:4], dtype=np.int32)
            cv2.fillPoly(mask, [pts], 255)
        
        mask_tensor = torch.from_numpy(mask).float().unsqueeze(0) / 255.0
        return mask_tensor

    def apply_perspective_transform(self, bg_cv2, src_cv2, dst_points, blend_mode="replace", opacity=1.0):
        """应用透视变换映射"""
        bg_height, bg_width = bg_cv2.shape[:2]
        src_height, src_width = src_cv2.shape[:2]
        
        # 源图像的四个角点
        src_points = np.array([
            [0, 0],                    # 左上
            [src_width, 0],            # 右上
            [src_width, src_height],   # 右下
            [0, src_height]            # 左下
        ], dtype=np.float32)
        
        # 目标屏幕的四个点
        dst_points = np.array(dst_points[:4], dtype=np.float32)
        
        try:
            # 计算透视变换矩阵
            perspective_matrix = cv2.getPerspectiveTransform(src_points, dst_points)
            
            # 应用透视变换
            transformed_image = cv2.warpPerspective(
                src_cv2,
                perspective_matrix,
                (bg_width, bg_height),
                flags=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_TRANSPARENT
            )
            
            # 创建变换区域的遮罩
            mask = np.zeros((bg_height, bg_width), dtype=np.uint8)
            cv2.fillPoly(mask, [dst_points.astype(int)], 255)
            mask_3ch = cv2.merge([mask, mask, mask]) / 255.0
            
            # 根据混合模式合成图像
            if blend_mode == "replace":
                result = bg_cv2.copy()
                result = np.where(mask_3ch > 0, transformed_image, result)
            else:
                blended = self.apply_blend_mode(bg_cv2, transformed_image, blend_mode, opacity)
                result = np.where(mask_3ch > 0, blended, bg_cv2)
            
            return result
            
        except Exception as e:
            print(f"透视变换失败: {e}")
            return bg_cv2

    def apply_blend_mode(self, background, foreground, mode, opacity):
        """应用混合模式"""
        bg = background.astype(np.float32) / 255.0
        fg = foreground.astype(np.float32) / 255.0
        
        if mode == "overlay":
            mask = fg < 0.5
            result = np.where(mask, 2 * fg * bg, 1 - 2 * (1 - fg) * (1 - bg))
        elif mode == "multiply":
            result = fg * bg
        elif mode == "screen":
            result = 1 - (1 - fg) * (1 - bg)
        else:
            result = fg
        
        # 应用透明度
        result = bg * (1 - opacity) + result * opacity
        return (result * 255).astype(np.uint8)

    def apply_perspective_mapping(self, background_image, source_image, four_points, 
                                blend_mode="replace", opacity=1.0, crop_to_screen=True):
        
        # 解析四个点坐标
        screen_points = self.parse_four_points(four_points)
        
        if len(screen_points) < 4:
            print(f"需要4个点，但只收到{len(screen_points)}个点")
            # 返回原始图像
            bg_height, bg_width = background_image.shape[1:3]
            empty_mask = torch.zeros((1, bg_height, bg_width), dtype=torch.float32)
            return (background_image, background_image, empty_mask)
        
        # 转换图像格式
        bg_cv2 = self.tensor_to_cv2(background_image)
        src_cv2 = self.tensor_to_cv2(source_image)
        
        bg_height, bg_width = bg_cv2.shape[:2]
        
        # 限制坐标在图像范围内
        for point in screen_points:
            point[0] = max(0, min(point[0], bg_width))
            point[1] = max(0, min(point[1], bg_height))
        
        # 应用透视变换
        result_cv2 = self.apply_perspective_transform(
            bg_cv2, src_cv2, screen_points, blend_mode, opacity
        )
        mapped_image = self.cv2_to_tensor(result_cv2)
        
        # 创建屏幕区域遮罩
        screen_mask = self.create_screen_mask(screen_points, bg_height, bg_width)
        
        # 裁剪屏幕区域
        cropped_screen = background_image
        if crop_to_screen:
            bbox = self.get_screen_bbox(screen_points[:4])
            if bbox:
                x_min, y_min, x_max, y_max = bbox
                x_min = max(0, x_min)
                y_min = max(0, y_min)
                x_max = min(bg_width, x_max)
                y_max = min(bg_height, y_max)
                
                if x_max > x_min and y_max > y_min:
                    cropped_screen = mapped_image[:, y_min:y_max, x_min:x_max, :]
        
        return (mapped_image, cropped_screen, screen_mask)

# ========================================
# ComfyUI节点注册
# ========================================

NODE_CLASS_MAPPINGS = {
    "CanvasFourPointSelector": CanvasFourPointSelector,
    "PerspectiveScreenMapper": PerspectiveScreenMapper,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CanvasFourPointSelector": "🎯 Canvas四点选择器",
    "PerspectiveScreenMapper": "🔄 透视变换映射器", 
}