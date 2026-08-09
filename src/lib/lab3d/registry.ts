// ---------------------------------------------------------------------------
// 3D 实验室 — 场景注册表
// 本文件不 import 任何场景实现（它们依赖 three.js，体积大），
// 只保存轻量元数据 + 动态加载器，保证卡片页等入口不会把 three 打进主包。
// 新增场景时：在 SCENES 与 LOADERS 各加一行，二者 id 必须一致。
// ---------------------------------------------------------------------------
import type { Scene3DDefinition } from './types';

export interface SceneMeta {
  id: string;
  title: string;
  subject: '数学' | '物理' | '化学';
  /** 适用年级学期：'7上' | '7下' | '8上' | '8下' | '9上' | '9下' | '9全' | '拓展' */
  grade?: string;
  icon: string;
  tagline: string;
  keywords: string[];
}

export const SCENES: SceneMeta[] = [
  // ================= 数学 =================
  {
    id: 'math-number-line',
    title: '数轴与绝对值',
    subject: '数学',
    grade: '7上',
    icon: '📏',
    tagline: '在会动的数轴上认识相反数、绝对值和不等式解集',
    keywords: ['数轴', '有理数', '相反数', '绝对值', '正数', '负数', '原点', '不等式', '解集', '实数'],
  },
  {
    id: 'math-equation-balance',
    title: '等式性质与解方程',
    subject: '数学',
    grade: '7上',
    icon: '⚖️',
    tagline: '用天平称出 x 的值——等式两边同加同减、同乘同除',
    keywords: ['方程', '一元一次方程', '等式性质', '解方程', '移项', '未知数', '天平'],
  },
  {
    id: 'math-solids',
    title: '立体几何图形',
    subject: '数学',
    grade: '7上',
    icon: '📦',
    tagline: '正方体展开图动画 + 圆柱、圆锥、球、棱柱的表面积与体积',
    keywords: ['立体几何', '正方体', '长方体', '圆柱', '圆锥', '球', '棱柱', '表面积', '体积', '展开图', '几何体'],
  },
  {
    id: 'math-angles',
    title: '相交线与角',
    subject: '数学',
    grade: '7下',
    icon: '📐',
    tagline: '两条直线相交：对顶角相等，邻补角互补',
    keywords: ['角', '相交线', '对顶角', '邻补角', '补角', '角平分线', '垂直', '垂线'],
  },
  {
    id: 'math-parallel',
    title: '平行线的判定与性质',
    subject: '数学',
    grade: '7下',
    icon: '🛤️',
    tagline: '转动截线，看同位角、内错角、同旁内角的关系',
    keywords: ['平行线', '同位角', '内错角', '同旁内角', '平行线的判定', '平行线的性质', '截线'],
  },
  {
    id: 'math-coordinate',
    title: '平面直角坐标系',
    subject: '数学',
    grade: '7下',
    icon: '🎯',
    tagline: '给平面上的每个点一个"地址"：象限、坐标与平移',
    keywords: ['平面直角坐标系', '坐标', '象限', '横坐标', '纵坐标', '原点', '平移', '点的坐标'],
  },
  {
    id: 'math-equation-system',
    title: '二元一次方程组',
    subject: '数学',
    grade: '7下',
    icon: '✖️',
    tagline: '两条直线的交点，就是方程组的解',
    keywords: ['二元一次方程组', '方程组', '代入消元', '加减消元', '交点', '解方程组'],
  },
  {
    id: 'math-triangle',
    title: '三角形的内角和',
    subject: '数学',
    grade: '8上',
    icon: '🔺',
    tagline: '把三个角撕下来拼一拼：正好拼成一个平角',
    keywords: ['三角形', '内角和', '三角形内角和', '外角', '三边关系', '多边形'],
  },
  {
    id: 'math-congruence',
    title: '全等三角形',
    subject: '数学',
    grade: '8上',
    icon: '📐',
    tagline: '经过翻折、平移、旋转后能够完全重合的两个三角形',
    keywords: ['全等三角形', '全等', 'SSS', 'SAS', 'ASA', 'AAS', '对应边', '对应角'],
  },
  {
    id: 'math-symmetry',
    title: '轴对称',
    subject: '数学',
    grade: '8上',
    icon: '🦋',
    tagline: '沿对称轴对折后两边完全重合——对称轴垂直平分对应点连线',
    keywords: ['轴对称', '对称轴', '对称图形', '对折', '垂直平分线', '等腰三角形'],
  },
  {
    id: 'math-parallelogram',
    title: '平行四边形',
    subject: '数学',
    grade: '8下',
    icon: '🔷',
    tagline: '对边相等、对角相等、对角线互相平分——拉一拉就明白',
    keywords: ['平行四边形', '矩形', '菱形', '正方形', '对角线', '对边', '对角'],
  },
  {
    id: 'math-pythagoras',
    title: '勾股定理',
    subject: '数学',
    grade: '8下',
    icon: '📐',
    tagline: '直角三角形三边上的正方形：a² + b² 的小方块恰好填满 c²',
    keywords: ['勾股定理', '直角三角形', '斜边', '直角边', '毕达哥拉斯', '平方', '弦图'],
  },
  {
    id: 'math-functions-jhs',
    title: '一次函数与反比例函数',
    subject: '数学',
    grade: '8下',
    icon: '📉',
    tagline: 'k 和 b 怎样改变直线？反比例函数的双曲线长什么样？',
    keywords: ['一次函数', '正比例函数', '反比例函数', '双曲线', '斜率', '截距', '比例系数'],
  },
  {
    id: 'math-statistics',
    title: '数据的分析',
    subject: '数学',
    grade: '8下',
    icon: '📊',
    tagline: '平均数、中位数、众数、方差——给一组数据画个像',
    keywords: ['平均数', '中位数', '众数', '方差', '统计', '数据分析', '波动', '极差'],
  },
  {
    id: 'math-quadratic-function',
    title: '二次函数的图像与性质',
    subject: '数学',
    grade: '9上',
    icon: '🎢',
    tagline: '开口方向、对称轴、顶点、与 x 轴交点——抛物线全解析',
    keywords: ['二次函数', '抛物线', '开口', '对称轴', '顶点', '判别式', '最值'],
  },
  {
    id: 'math-function-transform',
    title: '函数图像的变换',
    subject: '数学',
    grade: '9上',
    icon: '📈',
    tagline: '拖动 a、h、v，看抛物线如何伸缩与平移——图像变换的规律',
    keywords: ['函数', '函数图像', '二次函数', '抛物线', '平移', '对称', '顶点', '正弦函数', '绝对值', '图像变换'],
  },
  {
    id: 'math-rotation',
    title: '旋转与中心对称',
    subject: '数学',
    grade: '9上',
    icon: '🌀',
    tagline: '绕定点转动一个角度——旋转三要素与中心对称',
    keywords: ['旋转', '旋转中心', '旋转角', '中心对称', '中心对称图形', '旋转对称'],
  },
  {
    id: 'math-circle',
    title: '圆心角与圆周角',
    subject: '数学',
    grade: '9上',
    icon: '⭕',
    tagline: '同弧所对的圆周角，恰好是圆心角的一半',
    keywords: ['圆', '圆心', '半径', '直径', '弦', '弧', '圆心角', '圆周角', '垂径定理', '切线'],
  },
  {
    id: 'math-probability',
    title: '概率初步',
    subject: '数学',
    grade: '9上',
    icon: '🎲',
    tagline: '抛一百次硬币：频率会越来越接近概率',
    keywords: ['概率', '随机事件', '频率', '试验', '可能性', '等可能', '掷骰子', '摸球'],
  },
  {
    id: 'math-similarity',
    title: '相似三角形',
    subject: '数学',
    grade: '9下',
    icon: '🔺',
    tagline: '形状相同、大小不同：对应角相等，对应边成比例',
    keywords: ['相似', '相似三角形', '相似比', '对应边成比例', '位似', '平行线分线段'],
  },
  {
    id: 'math-trig',
    title: '锐角三角函数',
    subject: '数学',
    grade: '9下',
    icon: '📐',
    tagline: '正弦、余弦、正切，就是直角三角形三边的比值',
    keywords: ['三角函数', '正弦', '余弦', '正切', '锐角', '直角三角形', '特殊角', '解直角三角形'],
  },
  {
    id: 'math-three-views',
    title: '三视图',
    subject: '数学',
    grade: '9下',
    icon: '👁️',
    tagline: '同一个积木，从正面、左面、上面看各是什么样？',
    keywords: ['三视图', '主视图', '俯视图', '左视图', '视图', '投影', '观察物体', '从不同方向看'],
  },
  // ================= 物理 =================
  {
    id: 'phys-motion',
    title: '机械运动与参照物',
    subject: '物理',
    grade: '8上',
    icon: '🚗',
    tagline: '说一个物体在运动还是静止，要看选谁做参照物',
    keywords: ['机械运动', '参照物', '运动', '静止', '相对运动', '位置变化'],
  },
  {
    id: 'phys-speed-graph',
    title: '匀速直线运动与图像',
    subject: '物理',
    grade: '8上',
    icon: '📈',
    tagline: 's-t 图像的斜率就是速度，v-t 图像的面积就是路程',
    keywords: ['速度', '匀速直线运动', '路程', 's-t图像', 'v-t图像', '平均速度'],
  },
  {
    id: 'phys-sound',
    title: '声现象',
    subject: '物理',
    grade: '8上',
    icon: '🔊',
    tagline: '声音由振动产生：频率决定音调，振幅决定响度',
    keywords: ['声音', '声源', '振动', '音调', '响度', '音色', '频率', '振幅', '声波', '介质'],
  },
  {
    id: 'phys-states',
    title: '物态变化',
    subject: '物理',
    grade: '8上',
    icon: '🌡️',
    tagline: '冰化成水、水烧成气：熔化和沸腾时温度保持不变',
    keywords: ['熔化', '凝固', '汽化', '液化', '升华', '凝华', '熔点', '沸点', '物态变化', '晶体'],
  },
  {
    id: 'phys-light',
    title: '光的反射与折射',
    subject: '物理',
    grade: '8上',
    icon: '🔦',
    tagline: '激光射入水中：反射角等于入射角，折射光线偏向法线',
    keywords: ['光', '反射', '折射', '入射角', '反射角', '折射角', '法线', '全反射', '光的传播', '透镜'],
  },
  {
    id: 'phys-lens',
    title: '凸透镜成像',
    subject: '物理',
    grade: '8上',
    icon: '🔍',
    tagline: '移动蜡烛，看照相机、投影仪、放大镜分别是怎么成像的',
    keywords: ['凸透镜', '焦距', '实像', '虚像', '成像', '照相机', '投影仪', '放大镜', '焦点'],
  },
  {
    id: 'phys-density',
    title: '质量与密度',
    subject: '物理',
    grade: '8上',
    icon: '🧱',
    tagline: '同样大小的木块、铁块、铜块，为什么轻重差这么多？',
    keywords: ['质量', '密度', '天平', '体积', '密度公式', '物质特性', '千克'],
  },
  {
    id: 'phys-force',
    title: '力与二力平衡',
    subject: '物理',
    grade: '8下',
    icon: '💪',
    tagline: '力的示意图怎么画？二力平衡要满足哪四个条件？',
    keywords: ['力', '重力', '支持力', '摩擦力', '二力平衡', '力的示意图', '弹力', '力的作用效果'],
  },
  {
    id: 'phys-newton',
    title: '牛顿第一定律与惯性',
    subject: '物理',
    grade: '8下',
    icon: '🛞',
    tagline: '表面越光滑小车滑得越远——推理出：不受力的物体将一直运动',
    keywords: ['牛顿第一定律', '惯性', '阻力', '理想实验', '运动状态改变'],
  },
  {
    id: 'phys-pressure',
    title: '压强',
    subject: '物理',
    grade: '8下',
    icon: '🔻',
    tagline: '同样的压力，受力面积越小压强越大——钉子尖与滑雪板',
    keywords: ['压强', '压力', '受力面积', '压强公式', '增大压强', '减小压强'],
  },
  {
    id: 'phys-liquid-pressure',
    title: '液体压强与大气压',
    subject: '物理',
    grade: '8下',
    icon: '💧',
    tagline: '深度越深压强越大：看三个孔的水柱谁喷得远',
    keywords: ['液体压强', '深度', '压强计', '连通器', '大气压', '托里拆利', '马德堡半球'],
  },
  {
    id: 'phys-buoyancy',
    title: '浮力与浮沉条件',
    subject: '物理',
    grade: '8下',
    icon: '🛟',
    tagline: 'F 浮等于排开液体的重力：铁块沉底，轮船为什么能浮？',
    keywords: ['浮力', '阿基米德', '排开液体', '漂浮', '悬浮', '沉底', '浮沉条件', '密度比较'],
  },
  {
    id: 'phys-work',
    title: '功和功率',
    subject: '物理',
    grade: '8下',
    icon: '🏋️',
    tagline: '有力还要有距离才做功；做功快慢用功率表示',
    keywords: ['功', '功率', '做功', '焦耳', '瓦特', '有用功', '额外功'],
  },
  {
    id: 'phys-energy',
    title: '动能与势能的转化',
    subject: '物理',
    grade: '8下',
    icon: '🎢',
    tagline: '小球滚下波浪轨道：势能和动能此消彼长',
    keywords: ['动能', '势能', '重力势能', '机械能', '能量转化', '机械能守恒'],
  },
  {
    id: 'phys-lever',
    title: '杠杆的平衡条件',
    subject: '物理',
    grade: '8下',
    icon: '⚖️',
    tagline: '调节力和力臂，亲眼看到杠杆平衡或倾倒——F₁L₁ = F₂L₂',
    keywords: ['杠杆', '支点', '力臂', '动力', '阻力', '杠杆平衡', '简单机械', '滑轮', '机械'],
  },
  {
    id: 'phys-pulley',
    title: '滑轮与滑轮组',
    subject: '物理',
    grade: '8下',
    icon: '🪢',
    tagline: '定滑轮不省力、动滑轮省一半——滑轮组看绳子段数 n',
    keywords: ['滑轮', '定滑轮', '动滑轮', '滑轮组', '省力', '机械效率', '绳子段数'],
  },
  {
    id: 'phys-heat',
    title: '内能与比热容',
    subject: '物理',
    grade: '9全',
    icon: '🔥',
    tagline: '同样的火加热水和沙子，为什么沙子升温快得多？',
    keywords: ['内能', '比热容', '热传递', '做功', '温度', '热量', '分子动能'],
  },
  {
    id: 'phys-engine',
    title: '热机的四个冲程',
    subject: '物理',
    grade: '9全',
    icon: '🚙',
    tagline: '吸气、压缩、做功、排气——汽油机一个循环曲轴转两圈',
    keywords: ['热机', '汽油机', '冲程', '内燃机', '压缩冲程', '做功冲程', '火花塞', '柴油机'],
  },
  {
    id: 'phys-circuit',
    title: '串联电路与电流',
    subject: '物理',
    grade: '9全',
    icon: '🔌',
    tagline: '闭合开关看电子定向移动，电压越大灯泡越亮——欧姆定律',
    keywords: ['电路', '电流', '电压', '电阻', '欧姆定律', '串联', '开关', '电源', '灯泡', '导体'],
  },
  {
    id: 'phys-circuit-parallel',
    title: '并联电路与电功率',
    subject: '物理',
    grade: '9全',
    icon: '💡',
    tagline: '并联各走各的路互不干扰；灯泡有多亮，看实际功率',
    keywords: ['并联', '串联', '支路', '干路', '电功率', '额定功率', '实际功率', '亮度'],
  },
  {
    id: 'phys-resistance',
    title: '电阻的影响因素',
    subject: '物理',
    grade: '9全',
    icon: '🧵',
    tagline: '导体越长、越细，电阻越大——电阻是导体本身的性质',
    keywords: ['电阻', '导体', '横截面积', '长度', '材料', '欧姆', '滑动变阻器', '镍铬'],
  },
  {
    id: 'phys-magnet',
    title: '磁现象与电流的磁效应',
    subject: '物理',
    grade: '9全',
    icon: '🧲',
    tagline: '磁感线从 N 极出发回到 S 极；通电导线也能产生磁场',
    keywords: ['磁体', '磁极', '磁场', '磁感线', '电流的磁效应', '电磁铁', '奥斯特', '安培定则'],
  },
  {
    id: 'phys-motor',
    title: '电动机与发电机',
    subject: '物理',
    grade: '9全',
    icon: '⚙️',
    tagline: '通电线圈在磁场中受力转动；摇一摇又能发电',
    keywords: ['电动机', '发电机', '电磁感应', '线圈', '换向器', '磁场对电流的作用', '电生磁'],
  },
  {
    id: 'phys-home-circuit',
    title: '家庭电路与安全用电',
    subject: '物理',
    grade: '9全',
    icon: '🏠',
    tagline: '火线零线地线怎么接？保险丝为什么会熔断？',
    keywords: ['家庭电路', '火线', '零线', '地线', '保险丝', '空气开关', '安全用电', '插座', '短路'],
  },
  {
    id: 'phys-projectile',
    title: '抛体运动',
    subject: '物理',
    grade: '拓展',
    icon: '🏀',
    tagline: '发射小球看抛物线：水平方向匀速、竖直方向自由落体的叠加',
    keywords: ['抛体运动', '平抛', '斜抛', '抛物线', '自由落体', '重力', '加速度', '运动合成', '运动的分解', '曲线运动'],
  },
  // ================= 化学 =================
  {
    id: 'chem-lab',
    title: '常见仪器与基本操作',
    subject: '化学',
    grade: '9上',
    icon: '🥼',
    tagline: '试管、烧杯、酒精灯、量筒、滴管——实验室主角的正确用法',
    keywords: ['实验仪器', '试管', '烧杯', '酒精灯', '量筒', '胶头滴管', '加热', '实验操作', '仪器'],
  },
  {
    id: 'chem-air',
    title: '空气的成分',
    subject: '化学',
    grade: '9上',
    icon: '🌬️',
    tagline: '红磷燃烧实验：氧气约占空气体积的五分之一',
    keywords: ['空气', '氧气', '氮气', '稀有气体', '体积分数', '红磷', '测定氧气含量', '混合物'],
  },
  {
    id: 'chem-oxygen',
    title: '氧气的性质与制取',
    subject: '化学',
    grade: '9上',
    icon: '🫧',
    tagline: '加热高锰酸钾制氧气；带火星的木条复燃',
    keywords: ['氧气', '制取', '高锰酸钾', '过氧化氢', '催化剂', '助燃', '复燃', '排水法', '二氧化锰'],
  },
  {
    id: 'chem-molecule',
    title: '分子的空间结构',
    subject: '化学',
    grade: '9上',
    icon: '🧪',
    tagline: '水、二氧化碳、甲烷、氨的球棍模型，认识键角与孤对电子',
    keywords: ['分子', '原子', '共价键', '化学键', '键角', '分子结构', '水', '甲烷', '二氧化碳', '氨', '孤对电子'],
  },
  {
    id: 'chem-atom',
    title: '原子结构模型',
    subject: '化学',
    grade: '9上',
    icon: '⚛️',
    tagline: '质子、中子与分层排布的电子，理解最外层电子决定化学性质',
    keywords: ['原子', '原子核', '质子', '中子', '电子', '电子层', '核外电子', '最外层电子', '原子结构', '离子'],
  },
  {
    id: 'chem-diffusion',
    title: '分子热运动与扩散',
    subject: '化学',
    grade: '9上',
    icon: '🌫️',
    tagline: '抽走隔板看两种气体自发混合——分子在不停地做无规则运动',
    keywords: ['分子运动', '扩散', '热运动', '温度', '分子动理论', '微粒', '无规则运动'],
  },
  {
    id: 'chem-periodic',
    title: '元素周期表',
    subject: '化学',
    grade: '9上',
    icon: '🧬',
    tagline: '横行叫周期、纵列叫族——排布规律藏在原子结构里',
    keywords: ['元素周期表', '元素', '周期', '族', '原子序数', '元素符号', '门捷列夫'],
  },
  {
    id: 'chem-electrolysis',
    title: '电解水',
    subject: '化学',
    grade: '9上',
    icon: '⚡',
    tagline: '正氧负氢、氢二氧一——水是由氢元素和氧元素组成的',
    keywords: ['电解水', '氢气', '氧气', '水的组成', '电极', '正极', '负极', '电解'],
  },
  {
    id: 'chem-equation',
    title: '质量守恒与化学方程式',
    subject: '化学',
    grade: '9上',
    icon: '⚗️',
    tagline: '反应前后原子的种类和数目不变——配平就是在数原子',
    keywords: ['化学方程式', '质量守恒', '配平', '反应物', '生成物', '原子重新组合', '系数'],
  },
  {
    id: 'chem-carbon',
    title: '碳和碳的氧化物',
    subject: '化学',
    grade: '9上',
    icon: '🕯️',
    tagline: '把二氧化碳倒进烧杯，蜡烛由下而上依次熄灭',
    keywords: ['二氧化碳', '一氧化碳', '石灰水', '灭火', '温室效应', '金刚石', '石墨', '碳单质'],
  },
  {
    id: 'chem-combustion',
    title: '燃烧的条件',
    subject: '化学',
    grade: '9上',
    icon: '🔥',
    tagline: '可燃物、氧气、温度达到着火点——三个条件缺一不可',
    keywords: ['燃烧', '着火点', '可燃物', '氧气', '灭火', '白磷', '红磷', '自燃'],
  },
  {
    id: 'chem-metal',
    title: '金属活动性顺序',
    subject: '化学',
    grade: '9下',
    icon: '🥇',
    tagline: '镁锌铁铜分别放进稀盐酸，气泡剧烈程度大不一样',
    keywords: ['金属', '活动性顺序', '置换反应', '镁', '锌', '铁', '铜', '金属与酸', '氢气', '湿法炼铜'],
  },
  {
    id: 'chem-solution',
    title: '溶液与溶解度',
    subject: '化学',
    grade: '9下',
    icon: '🥛',
    tagline: '盐加多了就溶不下——饱和溶液、溶解度与结晶',
    keywords: ['溶液', '溶质', '溶剂', '溶解度', '饱和溶液', '不饱和溶液', '结晶', '溶质质量分数'],
  },
  {
    id: 'chem-nacl',
    title: '氯化钠离子晶体',
    subject: '化学',
    grade: '9下',
    icon: '🧂',
    tagline: '钠离子与氯离子交替排列成立体晶格，遇水为什么会溶解？',
    keywords: ['离子', '离子键', '晶体', '氯化钠', '食盐', '溶解', '钠离子', '氯离子', '晶格', '电解质'],
  },
  {
    id: 'chem-acid-base',
    title: '酸碱与中和反应',
    subject: '化学',
    grade: '9下',
    icon: '🧪',
    tagline: '石蕊遇酸变红遇碱变蓝；中和的本质是氢离子遇上氢氧根',
    keywords: ['酸', '碱', '酸碱指示剂', 'pH', '中和反应', '石蕊', '酚酞', '盐酸', '氢氧化钠', '酸碱度'],
  },
];

const LOADERS: Record<string, () => Promise<Scene3DDefinition>> = {
  // 数学
  'math-number-line': () => import('./scenes/numberLine').then((m) => m.numberLineScene),
  'math-equation-balance': () => import('./scenes/equationBalance').then((m) => m.equationBalanceScene),
  'math-solids': () => import('./scenes/solids').then((m) => m.solidsScene),
  'math-angles': () => import('./scenes/angles').then((m) => m.anglesScene),
  'math-parallel': () => import('./scenes/parallelLines').then((m) => m.parallelLinesScene),
  'math-coordinate': () => import('./scenes/coordinatePlane').then((m) => m.coordinatePlaneScene),
  'math-equation-system': () => import('./scenes/equationSystem').then((m) => m.equationSystemScene),
  'math-triangle': () => import('./scenes/triangle').then((m) => m.triangleScene),
  'math-congruence': () => import('./scenes/congruence').then((m) => m.congruenceScene),
  'math-symmetry': () => import('./scenes/symmetry').then((m) => m.symmetryScene),
  'math-parallelogram': () => import('./scenes/parallelogram').then((m) => m.parallelogramScene),
  'math-pythagoras': () => import('./scenes/pythagoras').then((m) => m.pythagorasScene),
  'math-functions-jhs': () => import('./scenes/functionsJhs').then((m) => m.functionsJhsScene),
  'math-statistics': () => import('./scenes/statistics').then((m) => m.statisticsScene),
  'math-quadratic-function': () => import('./scenes/quadraticFunction').then((m) => m.quadraticFunctionScene),
  'math-function-transform': () => import('./scenes/functionTransform').then((m) => m.functionScene),
  'math-rotation': () => import('./scenes/rotation').then((m) => m.rotationScene),
  'math-circle': () => import('./scenes/circle').then((m) => m.circleScene),
  'math-probability': () => import('./scenes/probability').then((m) => m.probabilityScene),
  'math-similarity': () => import('./scenes/similarity').then((m) => m.similarityScene),
  'math-trig': () => import('./scenes/trig').then((m) => m.trigScene),
  'math-three-views': () => import('./scenes/threeViews').then((m) => m.threeViewsScene),
  // 物理
  'phys-motion': () => import('./scenes/motion').then((m) => m.motionScene),
  'phys-speed-graph': () => import('./scenes/speedGraph').then((m) => m.speedGraphScene),
  'phys-sound': () => import('./scenes/sound').then((m) => m.soundScene),
  'phys-states': () => import('./scenes/states').then((m) => m.statesScene),
  'phys-light': () => import('./scenes/light').then((m) => m.lightScene),
  'phys-lens': () => import('./scenes/lens').then((m) => m.lensScene),
  'phys-density': () => import('./scenes/density').then((m) => m.densityScene),
  'phys-force': () => import('./scenes/force').then((m) => m.forceScene),
  'phys-newton': () => import('./scenes/newton').then((m) => m.newtonScene),
  'phys-pressure': () => import('./scenes/pressure').then((m) => m.pressureScene),
  'phys-liquid-pressure': () => import('./scenes/liquidPressure').then((m) => m.liquidPressureScene),
  'phys-buoyancy': () => import('./scenes/buoyancy').then((m) => m.buoyancyScene),
  'phys-work': () => import('./scenes/work').then((m) => m.workScene),
  'phys-energy': () => import('./scenes/energy').then((m) => m.energyScene),
  'phys-lever': () => import('./scenes/lever').then((m) => m.leverScene),
  'phys-pulley': () => import('./scenes/pulley').then((m) => m.pulleyScene),
  'phys-heat': () => import('./scenes/heat').then((m) => m.heatScene),
  'phys-engine': () => import('./scenes/engine').then((m) => m.engineScene),
  'phys-circuit': () => import('./scenes/circuit').then((m) => m.circuitScene),
  'phys-circuit-parallel': () => import('./scenes/circuitParallel').then((m) => m.circuitParallelScene),
  'phys-resistance': () => import('./scenes/resistance').then((m) => m.resistanceScene),
  'phys-magnet': () => import('./scenes/magnet').then((m) => m.magnetScene),
  'phys-motor': () => import('./scenes/motor').then((m) => m.motorScene),
  'phys-home-circuit': () => import('./scenes/homeCircuit').then((m) => m.homeCircuitScene),
  'phys-projectile': () => import('./scenes/projectile').then((m) => m.projectileScene),
  // 化学
  'chem-lab': () => import('./scenes/labEquipment').then((m) => m.labEquipmentScene),
  'chem-air': () => import('./scenes/air').then((m) => m.airScene),
  'chem-oxygen': () => import('./scenes/oxygen').then((m) => m.oxygenScene),
  'chem-molecule': () => import('./scenes/molecule').then((m) => m.moleculeScene),
  'chem-atom': () => import('./scenes/atom').then((m) => m.atomScene),
  'chem-diffusion': () => import('./scenes/diffusion').then((m) => m.diffusionScene),
  'chem-periodic': () => import('./scenes/periodic').then((m) => m.periodicScene),
  'chem-electrolysis': () => import('./scenes/electrolysis').then((m) => m.electrolysisScene),
  'chem-equation': () => import('./scenes/equation').then((m) => m.equationScene),
  'chem-carbon': () => import('./scenes/carbon').then((m) => m.carbonScene),
  'chem-combustion': () => import('./scenes/combustion').then((m) => m.combustionScene),
  'chem-metal': () => import('./scenes/metal').then((m) => m.metalScene),
  'chem-solution': () => import('./scenes/solution').then((m) => m.solutionScene),
  'chem-nacl': () => import('./scenes/nacl').then((m) => m.naclScene),
  'chem-acid-base': () => import('./scenes/acidBase').then((m) => m.acidBaseScene),
};

export function getSceneMeta(id: string): SceneMeta | undefined {
  return SCENES.find((s) => s.id === id);
}

/** 动态加载完整场景定义（此时才把 three.js 拉进浏览器） */
export async function loadScene(id: string): Promise<Scene3DDefinition | null> {
  const loader = LOADERS[id];
  if (!loader) return null;
  try {
    return await loader();
  } catch {
    return null;
  }
}

/**
 * 按知识点内容匹配场景。
 * title 命中关键词 +3 分/个；keywords 命中 +2 分/个；学科一致 +1。
 * 返回得分 ≥3 的场景，按分数降序，最多 3 个。
 */
export function matchScenes(input: {
  title?: string | null;
  keywords?: string[] | string | null;
  subjectName?: string | null;
}): SceneMeta[] {
  const title = (input.title ?? '').toLowerCase();
  const kwText = (
    Array.isArray(input.keywords) ? input.keywords.join(' ') : (input.keywords ?? '')
  ).toLowerCase();
  const haystack = `${title} ${kwText}`;
  if (!haystack.trim()) return [];

  const scored = SCENES.map((scene) => {
    let score = 0;
    for (const kw of scene.keywords) {
      const k = kw.toLowerCase();
      if (title.includes(k)) score += 3;
      else if (kwText.includes(k)) score += 2;
    }
    if (input.subjectName && scene.subject === input.subjectName) score += 1;
    return { scene, score };
  });
  return scored
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.scene);
}
