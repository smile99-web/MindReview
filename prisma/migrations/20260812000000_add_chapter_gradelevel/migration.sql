-- Chapter.gradeLevel：章/单元所属学期（"七年级上"…"九年级下"）。
-- 教材目录核验重建（2026-08）引入：同名单元在不同学期各有章节行，
-- 且无小节章（如地理"发展与合作"）没有节点可供多数派推断，
-- 需要章节自身携带学期标签。可空，旧数据由脚本回填。
ALTER TABLE "Chapter" ADD COLUMN "gradeLevel" TEXT;
CREATE INDEX "Chapter_subjectId_gradeLevel_idx" ON "Chapter"("subjectId", "gradeLevel");
