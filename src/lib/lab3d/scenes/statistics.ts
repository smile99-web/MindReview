// ---------------------------------------------------------------------------
// 数学 · 数据的分析：平均数、中位数、众数、方差
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import type { Scene3DDefinition, SceneContext, SceneHandle } from '../types';
import { addStageBasics, damp, disposeObject, makeLabel, std } from '../three-utils';

type DataKey = 'even' | 'spread' | 'outlier';
const DATA: Record<DataKey, { name: string; values: number[] }> = {
  even: { name: '甲组', values: [85, 92, 88, 88, 86, 89, 87] },
  spread: { name: '乙组', values: [72, 96, 81, 94, 76, 91, 91] },
  outlier: { name: '丙组', values: [86, 88, 40, 87, 85, 89, 86] },
};
const N = 7;
const H_SCALE = 0.07; // 数值 → 柱高
const GAP = 1.1; // 柱子间距

const f1 = (n: number) => n.toFixed(1);

export const statisticsScene: Scene3DDefinition = {
  id: 'math-statistics',
  title: '数据的分析',
  subject: '数学',
  grade: '8下',
  icon: '📊',
  tagline: '平均数、中位数、众数、方差——给一组数据画个像',
  keywords: ['平均数', '中位数', '众数', '方差', '统计', '数据分析', '波动', '极差'],
  camera: { position: [0, 5.5, 12], target: [0, 3.2, 0] },
  controls: [
    {
      kind: 'select',
      id: 'data',
      label: '数据集',
      options: [
        { value: 'even', label: '甲组·较均匀' },
        { value: 'spread', label: '乙组·较分散' },
        { value: 'outlier', label: '丙组·含极端值' },
      ],
      defaultValue: 'even',
    },
  ],
  steps: [
    {
      title: '平均数',
      text: '平均数是把所有数据加起来再平分，相当于把高的柱子削低、低的柱子垫高之后拉平的高度。半透明平面标出了平均数的位置。切换数据集，看平面跟着上下移动。',
    },
    {
      title: '中位数与众数',
      text: '把数据按大小排排队，站在正中间的就是中位数——看，柱子自动排好了，绿色的是中位数。出现次数最多的叫众数，紫色柱子标出了它。',
    },
    {
      title: '极端值的影响',
      text: '换到丙组：混进了一个 40 分。平均数被它猛地拉低，明显低于大多数成绩；而中位数只在乎排队位置，几乎不动。所以数据里有极端值时，中位数更可靠。',
    },
    {
      title: '方差看波动',
      text: '方差衡量数据离平均数有多远：每根柱子到平均平面的红线越长，偏差越大。乙组的红线明显比甲组长，说明乙组波动大、方差大；数据越集中，方差越小。',
    },
  ],
  build(ctx: SceneContext): SceneHandle {
    addStageBasics(ctx.scene, 14);
    let dataKey: DataKey = 'even';
    let step = 0;

    const group = new THREE.Group();
    ctx.scene.add(group);

    // 统计量
    let mean = 0;
    let median = 0;
    let mode = 0;
    let variance = 0;
    let values: number[] = [];
    let sortedSlot: number[] = []; // 每根柱子排序后的槽位
    let medianBar = 0; // 排序后位于中间的柱子编号
    let meanH = 0;
    let meanHCur = 0;

    // 柱子
    const bars: THREE.Mesh[] = [];
    const barMats: THREE.MeshStandardMaterial[] = [];
    const valueLabels: THREE.Sprite[] = [];
    for (let i = 0; i < N; i++) {
      const mat = std('#3b82f6', { emissive: '#2563eb', emissiveIntensity: 0.25 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.8), mat);
      bar.position.set((i - 3) * GAP, 0, 0);
      group.add(bar);
      bars.push(bar);
      barMats.push(mat);
      const vl = makeLabel('', { fontSize: 34, scale: 0.75, color: '#334155' });
      group.add(vl);
      valueLabels.push(vl);
    }

    // 平均数平面
    const meanPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(8.6, 2.4),
      new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    );
    meanPlane.rotation.x = -Math.PI / 2;
    group.add(meanPlane);

    // 偏差线（方差步骤）
    const devLines: THREE.Mesh[] = [];
    const devMat = std('#dc2626', { emissive: '#b91c1c', emissiveIntensity: 0.6 });
    for (let i = 0; i < N; i++) {
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), devMat);
      line.visible = false;
      group.add(line);
      devLines.push(line);
    }

    // 标签
    const infoLabel = makeLabel('', { fontSize: 36, scale: 0.9, color: '#0f172a' });
    infoLabel.position.set(0, 7.7, 0);
    group.add(infoLabel);
    const meanLabel = makeLabel('', { fontSize: 32, scale: 0.8, color: '#b45309' });
    group.add(meanLabel);
    const medianLabel = makeLabel('', { fontSize: 32, scale: 0.8, color: '#15803d' });
    group.add(medianLabel);
    const modeLabel = makeLabel('', { fontSize: 32, scale: 0.8, color: '#7c3aed' });
    group.add(modeLabel);
    const varLabel = makeLabel('', { fontSize: 32, scale: 0.8, color: '#b91c1c' });
    varLabel.position.set(0, -0.9, 0);
    group.add(varLabel);
    const hintLabel = makeLabel('👆 换成「丙组·含极端值」看效果', { fontSize: 32, scale: 0.8, color: '#b45309' });
    hintLabel.position.set(0, -0.9, 0);
    group.add(hintLabel);

    /** 换文字：释放旧 material 再替换 */
    const setLabel = (
      sprite: THREE.Sprite,
      text: string,
      opts: { fontSize: number; scale: number; color: string },
    ) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      const nl = makeLabel(text, opts);
      sprite.material = nl.material;
      sprite.scale.copy(nl.scale);
    };

    const refreshColors = () => {
      for (let i = 0; i < N; i++) {
        let color = '#3b82f6';
        let emissive = '#2563eb';
        if (step >= 1 && values[i] === mode) {
          color = '#8b5cf6';
          emissive = '#6d28d9';
        }
        if (step >= 1 && i === medianBar) {
          color = '#16a34a';
          emissive = '#15803d';
        }
        barMats[i].color.set(color);
        barMats[i].emissive.set(emissive);
      }
    };

    const rebuild = () => {
      const d = DATA[dataKey];
      values = d.values;
      mean = values.reduce((s, v) => s + v, 0) / N;
      meanH = mean * H_SCALE;
      const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b] || a - b);
      sortedSlot = new Array<number>(N).fill(0);
      order.forEach((barIdx, slot) => {
        sortedSlot[barIdx] = slot;
      });
      medianBar = order[3];
      median = values[medianBar];
      // 众数（出现次数最多，取最小者）
      const count = new Map<number, number>();
      values.forEach((v) => count.set(v, (count.get(v) ?? 0) + 1));
      mode = values[0];
      count.forEach((c, v) => {
        if (c > (count.get(mode) ?? 0) || (c === count.get(mode) && v < mode)) mode = v;
      });
      variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / N;
      // 文字
      for (let i = 0; i < N; i++) {
        setLabel(valueLabels[i], `${values[i]}`, { fontSize: 34, scale: 0.75, color: '#334155' });
      }
      setLabel(
        infoLabel,
        `${d.name}：平均数 ${f1(mean)}，中位数 ${median}，众数 ${mode}，方差 ${f1(variance)}`,
        { fontSize: 36, scale: 0.9, color: '#0f172a' },
      );
      setLabel(meanLabel, `平均数 = ${f1(mean)}`, { fontSize: 32, scale: 0.8, color: '#b45309' });
      setLabel(medianLabel, `中位数 = ${median}`, { fontSize: 32, scale: 0.8, color: '#15803d' });
      setLabel(modeLabel, `众数 = ${mode}`, { fontSize: 32, scale: 0.8, color: '#7c3aed' });
      setLabel(varLabel, `方差 = ${f1(variance)}（红线越长偏差越大）`, {
        fontSize: 32,
        scale: 0.8,
        color: '#b91c1c',
      });
      refreshColors();
    };

    const applyStep = () => {
      medianLabel.visible = step >= 1;
      modeLabel.visible = step >= 1;
      varLabel.visible = step >= 3;
      hintLabel.visible = step === 2 && dataKey !== 'outlier';
      refreshColors();
    };

    rebuild();
    applyStep();
    meanHCur = meanH;

    return {
      setStep(i) {
        step = i;
        applyStep();
      },
      setParam(id, value) {
        if (id === 'data') {
          dataKey = String(value) as DataKey;
          rebuild();
          applyStep();
        }
      },
      update(dt) {
        // 平均平面阻尼
        meanHCur = damp(meanHCur, meanH, 6, dt);
        meanPlane.position.y = meanHCur;
        meanLabel.position.set(4.6, meanHCur + 0.15, 0);
        const sortedView = step >= 1;
        for (let i = 0; i < N; i++) {
          const targetX = ((sortedView ? sortedSlot[i] : i) - 3) * GAP;
          const targetH = values[i] * H_SCALE;
          const bar = bars[i];
          bar.position.x = damp(bar.position.x, targetX, 5, dt);
          bar.scale.y = damp(bar.scale.y, targetH, 6, dt);
          bar.position.y = bar.scale.y / 2;
          valueLabels[i].position.set(bar.position.x, bar.scale.y + 0.4, 0);
          // 偏差线
          const line = devLines[i];
          const len = Math.abs(bar.scale.y - meanHCur);
          const show = step >= 3 && len > 0.03;
          line.visible = show;
          if (show) {
            line.scale.y = len;
            line.position.set(bar.position.x, (bar.scale.y + meanHCur) / 2, 0);
          }
        }
        // 中位数 / 众数标签跟随柱子（同一根柱子时上下错开）
        const mb = bars[medianBar];
        medianLabel.position.set(mb.position.x, mb.scale.y + 0.95, 0);
        const firstMode = values.indexOf(mode);
        const fb = bars[firstMode];
        modeLabel.position.set(fb.position.x, fb.scale.y + (firstMode === medianBar ? 1.55 : 0.95), 0);
      },
      dispose() {
        ctx.scene.remove(group);
        disposeObject(group);
      },
    };
  },
};
