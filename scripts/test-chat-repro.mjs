// scripts/test-chat-repro.mjs
// 临时调试脚本：用与生产相同的 system prompt + "大气圈的中部有多高"，看 DeepSeek 实际返回。
// 用法：DEEPSEEK_API_KEY=sk-xxx node scripts/test-chat-repro.mjs
import OpenAI from 'openai';

const systemPrompt = `你是一位耐心、亲切、专业的中学辅导老师，正在和一位中学生进行多轮对话答疑。

你的任务：
1. 用通俗易懂的中文回答学生关于概念、公式、定理、例题、实验等的问题。
2. 必要时给出一个**贴近生活的类比**或**小例子**，帮学生建立直觉。
3. 学生提出的概念模糊或答错时，先复述学生理解、再温和纠正，并补一句鼓励。
4. 公式必须用 LaTeX：行内用 $...$，独立公式用 $$...$$。
5. 不要直接给整道题的答案；先引导学生思考。
6. 严禁出现 Markdown 标题符号（#）、列表项目符号（- * 1.），用自然段 + LaTeX 表达即可。
7. 对话语言：中文。

【输出格式 — 必须为严格 JSON】
{
  "reply": "给学生看的回复文本（包含可能的 LaTeX）",
  "needsImage": true | false,
  "imagePrompt": "仅当 needsImage=true 时填写；用中文写一段适合生成教育插图的画面描述",
  "imageType": "knowledge | experiment | timeline | force | reaction | portrait 中的一个"
}

【何时需要 needsImage=true】
- 学生明确说"画一张图 / 生成图片 / 配张图 / 看看长什么样"等；
- 学生要求"示意图 / 流程图 / 受力图 / 反应过程 / 时间线 / 人物肖像"等可视化内容；
- 涉及抽象概念（如电场、分子结构、历史事件顺序）时，学生暗示想要画面帮助理解。

【imagePrompt 编写要点】
- 用中文描述，主体清晰、风格适合中学生；
- 明确"白色背景 / 教育插图风格 / 中文标注"等关键约束；
- 不要写"图"、"图片"等元词，直接描述画面。`;

const question = '大气圈的中部有多高？';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
});

const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

console.log(`\n=== Calling DeepSeek (${model}) ===`);
const res = await client.chat.completions.create({
  model,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question },
  ],
  temperature: 0.7,
  max_tokens: 2048,
  response_format: { type: 'json_object' },
});

const raw = res.choices[0]?.message?.content || '';
console.log('\n=== RAW RESPONSE ===');
console.log(JSON.stringify(raw));
console.log('\n=== RAW LENGTH ===', raw.length);
console.log('\n=== FINISH REASON ===', res.choices[0]?.finish_reason);
console.log('\n=== USAGE ===', JSON.stringify(res.usage));

// 模拟 server 端的 normalize 流程
import { sanitizeJsonString } from '../src/lib/utils.ts';
console.log('\n=== SANITIZED ===');
const cleaned = sanitizeJsonString(raw);
console.log(JSON.stringify(cleaned));
try {
  const parsed = JSON.parse(cleaned);
  console.log('\n=== PARSED ===');
  console.log(JSON.stringify(parsed, null, 2));
  console.log('\n=== reply field ===', JSON.stringify(parsed.reply));
} catch (e) {
  console.log('\n=== JSON PARSE FAILED ===', e.message);
}