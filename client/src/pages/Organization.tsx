import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Building2, UserPlus, Users, Crown, Shield, User, Trash2, LogOut,
  Search, Loader2, Edit2, Check, X,
} from "lucide-react";

const ROLE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  owner: { label: "擁有者", icon: <Crown className="w-3.5 h-3.5" />, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  admin: { label: "管理員", icon: <Shield className="w-3.5 h-3.5" />, color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  member: { label: "成員", icon: <User className="w-3.5 h-3.5" />, color: "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400" },
};

export default function Organization() {
  const { user, isAuthenticated } = useAuth();
  const [newOrgName, setNewOrgName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");

  // Queries
  const orgQuery = trpc.org.my.useQuery(undefined, { enabled: isAuthenticated });
  const membersQuery = trpc.org.members.useQuery(undefined, {
    enabled: isAuthenticated && !!orgQuery.data,
  });
  const allUsersQuery = trpc.org.allUsers.useQuery(undefined, {
    enabled: isAuthenticated && !!orgQuery.data && (orgQuery.data?.role === 'owner' || orgQuery.data?.role === 'admin'),
  });

  // Mutations
  const utils = trpc.useUtils();
  const createOrgMut = trpc.org.create.useMutation({
    onSuccess: () => {
      toast.success("公司建立成功！");
      utils.org.my.invalidate();
      utils.org.members.invalidate();
      setNewOrgName("");
      setIsCreating(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateNameMut = trpc.org.updateName.useMutation({
    onSuccess: () => {
      toast.success("公司名稱已更新");
      utils.org.my.invalidate();
      setIsEditing(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const addMemberMut = trpc.org.addMember.useMutation({
    onSuccess: () => {
      toast.success("成員已新增");
      utils.org.members.invalidate();
      utils.org.allUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMemberMut = trpc.org.removeMember.useMutation({
    onSuccess: () => {
      toast.success("成員已移除");
      utils.org.members.invalidate();
      utils.org.allUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRoleMut = trpc.org.updateMemberRole.useMutation({
    onSuccess: () => {
      toast.success("角色已更新");
      utils.org.members.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const leaveMut = trpc.org.leave.useMutation({
    onSuccess: () => {
      toast.success("已退出公司");
      utils.org.my.invalidate();
      utils.org.members.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!isAuthenticated) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center py-16">
          <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold mb-2">請先登入</h2>
          <p className="text-sm text-muted-foreground">登入後即可使用公司管理功能</p>
        </div>
      </div>
    );
  }

  const org = orgQuery.data;
  const members = membersQuery.data ?? [];
  const allUsers = allUsersQuery.data ?? [];
  const isOwnerOrAdmin = org?.role === 'owner' || org?.role === 'admin';
  const memberUserIds = new Set(members.map(m => m.userId));

  // Filter available users for adding (not already members)
  const availableUsers = allUsers.filter(u => !memberUserIds.has(u.id));
  const filteredAvailable = searchQuery
    ? availableUsers.filter(u =>
        (u.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (u.email?.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : availableUsers;

  // No org — show create form
  if (!org) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            公司管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            建立公司後，同公司的成員可以共享廣告資料、帳號設定和 BM 快取
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">建立新公司</CardTitle>
            <CardDescription>
              建立公司後您將成為擁有者，可以邀請其他已登入的用戶加入。同公司成員共享所有廣告資料和設定。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="輸入公司名稱..."
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newOrgName.trim()) {
                    createOrgMut.mutate({ name: newOrgName.trim() });
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={() => createOrgMut.mutate({ name: newOrgName.trim() })}
                disabled={!newOrgName.trim() || createOrgMut.isPending}
              >
                {createOrgMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Building2 className="w-4 h-4 mr-1" />
                )}
                建立公司
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>如果您的公司已經建立，請聯繫管理員將您加入</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Has org — show management
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            公司管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理公司成員和共享設定
          </p>
        </div>
        {org.role !== 'owner' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm('確定要退出公司嗎？退出後將無法存取公司共享資料。')) {
                leaveMut.mutate();
              }
            }}
            disabled={leaveMut.isPending}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <LogOut className="w-3.5 h-3.5 mr-1" />
            退出公司
          </Button>
        )}
      </div>

      {/* Org Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 w-64"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editName.trim()) {
                        updateNameMut.mutate({ name: editName.trim() });
                      }
                      if (e.key === 'Escape') setIsEditing(false);
                    }}
                    autoFocus
                  />
                  <Button
                    size="sm" variant="ghost" className="h-8 w-8 p-0"
                    onClick={() => updateNameMut.mutate({ name: editName.trim() })}
                    disabled={!editName.trim() || updateNameMut.isPending}
                  >
                    <Check className="w-4 h-4 text-green-600" />
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-8 w-8 p-0"
                    onClick={() => setIsEditing(false)}
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <>
                  <CardTitle className="text-xl">{org.orgName}</CardTitle>
                  {isOwnerOrAdmin && (
                    <Button
                      size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => { setEditName(org.orgName); setIsEditing(true); }}
                    >
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </>
              )}
            </div>
            <Badge className={ROLE_LABELS[org.role]?.color}>
              {ROLE_LABELS[org.role]?.icon}
              <span className="ml-1">{ROLE_LABELS[org.role]?.label}</span>
            </Badge>
          </div>
          <CardDescription>
            {members.length} 位成員 · 同公司成員共享所有廣告資料和設定
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Members List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            成員列表
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((member) => {
            const roleInfo = ROLE_LABELS[member.role] || ROLE_LABELS.member;
            const isCurrentUser = member.userId === user?.id;
            return (
              <div
                key={member.memberId}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                    {(member.userName || '?')[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {member.userName || member.userEmail || `User #${member.userId}`}
                      </span>
                      {isCurrentUser && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">你</Badge>
                      )}
                    </div>
                    {member.userEmail && (
                      <p className="text-xs text-muted-foreground">{member.userEmail}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isOwnerOrAdmin && !isCurrentUser && member.role !== 'owner' ? (
                    <>
                      {org.role === 'owner' && (
                        <Select
                          value={member.role}
                          onValueChange={(value) => {
                            updateRoleMut.mutate({ userId: member.userId, role: value as 'admin' | 'member' });
                          }}
                        >
                          <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">管理員</SelectItem>
                            <SelectItem value="member">成員</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {org.role !== 'owner' && (
                        <Badge className={roleInfo.color}>
                          {roleInfo.icon}
                          <span className="ml-1">{roleInfo.label}</span>
                        </Badge>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => {
                          if (confirm(`確定要移除 ${member.userName || member.userEmail} 嗎？`)) {
                            removeMemberMut.mutate({ userId: member.userId });
                          }
                        }}
                        disabled={removeMemberMut.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Badge className={roleInfo.color}>
                      {roleInfo.icon}
                      <span className="ml-1">{roleInfo.label}</span>
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
          {members.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Users className="w-6 h-6 mx-auto mb-2 opacity-40" />
              載入中...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Member (owner/admin only) */}
      {isOwnerOrAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              新增成員
            </CardTitle>
            <CardDescription>
              從已登入過系統的用戶中選擇要加入公司的成員
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜尋用戶名稱或 Email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {filteredAvailable.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  {searchQuery ? '沒有找到符合的用戶' : '沒有可新增的用戶（所有用戶都已在公司中）'}
                </div>
              )}
              {filteredAvailable.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {(u.name || '?')[0]?.toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm font-medium">{u.name || `User #${u.id}`}</span>
                      {u.email && (
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => addMemberMut.mutate({ userId: u.id, role: 'member' })}
                    disabled={addMemberMut.isPending}
                  >
                    <UserPlus className="w-3 h-3" />
                    新增
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
