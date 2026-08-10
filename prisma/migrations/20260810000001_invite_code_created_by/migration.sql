-- 推荐码记录创建人：登录用户可在 /invite 页面自己生成推荐码分享给新用户
-- CLI 脚本创建的码 createdById 为 NULL（不属于任何用户，也不被任何人删除）
ALTER TABLE "InviteCode" ADD COLUMN "createdById" TEXT;

CREATE INDEX "InviteCode_createdById_idx" ON "InviteCode"("createdById");

ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL;
