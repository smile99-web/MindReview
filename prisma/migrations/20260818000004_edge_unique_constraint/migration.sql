-- 建边三元组唯一约束：从根上杜绝重复边（重试/双击/并发曾靠应用层查重，
-- 存在先查后写竞态）。已确认线上无存量重复边。
CREATE UNIQUE INDEX "KnowledgeEdge_fromId_toId_relationType_key"
  ON "KnowledgeEdge"("fromId", "toId", "relationType");
