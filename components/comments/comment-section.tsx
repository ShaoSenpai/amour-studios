"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";

// ============================================================================
// Amour Studios — Comment Section
// ============================================================================

export function CommentSection({ lessonId }: { lessonId: Id<"lessons"> }) {
  const comments = useQuery(api.comments.listByLesson, { lessonId });
  const user = useQuery(api.users.current);

  if (comments === undefined) {
    return <p className="text-sm text-muted-foreground">Chargement...</p>;
  }

  return (
    <div>
      <h2
        className="mb-4 text-2xl italic"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Commentaires ({comments.length})
      </h2>

      {/* New comment form */}
      {user && <NewCommentForm lessonId={lessonId} />}

      {/* Comments list */}
      <div className="flex flex-col gap-4 mt-4">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <p className="text-sm text-muted-foreground">
              Pas encore de commentaires.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Sois le premier a partager ton avis sur cette lecon !
            </p>
          </div>
        ) : (
          comments.map((comment) => (
            <CommentThread
              key={comment._id}
              comment={comment}
              lessonId={lessonId}
              currentUserId={user?._id}
              isAdmin={user?.role === "admin"}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────
function NewCommentForm({
  lessonId,
  parentCommentId,
  onDone,
}: {
  lessonId: Id<"lessons">;
  parentCommentId?: Id<"comments">;
  onDone?: () => void;
}) {
  const createComment = useMutation(api.comments.create);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    try {
      await createComment({
        lessonId,
        content: content.trim(),
        parentCommentId,
      });
      setContent("");
      onDone?.();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erreur";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={parentCommentId ? "Répondre..." : "Ajouter un commentaire..."}
        className="flex-1 h-10 rounded-md border border-foreground/25 bg-foreground/[0.04] px-3 text-sm font-mono outline-none transition-colors focus:border-foreground/50 focus:bg-foreground/[0.06]"
        style={{ fontFamily: "var(--font-body)", minHeight: 0 }}
        maxLength={2000}
      />
      <button
        type="submit"
        disabled={!content.trim() || submitting}
        className="rounded-md px-4 font-mono text-[11px] font-bold uppercase tracking-[2px] transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{
          background: "#FF6B1F",
          color: "#0D0B08",
          fontFamily: "var(--font-body)",
          minHeight: 0,
        }}
      >
        {parentCommentId ? "Répondre" : "Poster"}
      </button>
      {parentCommentId && onDone && (
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-foreground/25 px-3 font-mono text-[11px] uppercase tracking-[1.5px] text-foreground/70 hover:bg-foreground/[0.05]"
          style={{ fontFamily: "var(--font-body)", minHeight: 0 }}
        >
          Annuler
        </button>
      )}
    </form>
  );
}

// ────────────────────────────────────────────────────
type CommentWithReplies = {
  _id: Id<"comments">;
  content: string;
  createdAt: number;
  updatedAt: number;
  userName: string;
  userImage?: string;
  userRole?: string;
  userId: Id<"users">;
  replies: {
    _id: Id<"comments">;
    content: string;
    createdAt: number;
    userName: string;
    userImage?: string;
    userRole?: string;
    userId: Id<"users">;
  }[];
};

function CommentThread({
  comment,
  lessonId,
  currentUserId,
  isAdmin,
}: {
  comment: CommentWithReplies;
  lessonId: Id<"lessons">;
  currentUserId?: Id<"users">;
  isAdmin?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const removeComment = useMutation(api.comments.remove);

  const canDelete =
    currentUserId === comment.userId || isAdmin;

  return (
    <div className="rounded-lg border border-border/50 p-4">
      {/* Main comment */}
      <div className="flex items-start gap-3">
        {comment.userImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={comment.userImage}
            alt={comment.userName}
            className="size-8 rounded-full border border-border shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <span className="text-xs">{comment.userName[0]}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{comment.userName}</span>
            {comment.userRole === "admin" && (
              <Badge variant="outline" className="text-[10px] h-4">
                Admin
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {formatDate(comment.createdAt)}
            </span>
          </div>
          <p className="text-sm mt-1 whitespace-pre-line">{comment.content}</p>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setReplying(!replying)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Répondre
            </button>
            {canDelete && (
              <button
                onClick={async () => {
                  await removeComment({ commentId: comment._id });
                  toast.success("Commentaire supprimé");
                }}
                className="text-xs text-destructive hover:text-destructive/80"
              >
                Supprimer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reply form */}
      {replying && (
        <div className="mt-3 ml-4 sm:ml-11">
          <NewCommentForm
            lessonId={lessonId}
            parentCommentId={comment._id}
            onDone={() => setReplying(false)}
          />
        </div>
      )}

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div className="mt-3 ml-4 sm:ml-11 flex flex-col gap-3 border-l-2 border-border/30 pl-4">
          {comment.replies.map((reply) => (
            <div key={reply._id} className="flex items-start gap-2">
              {reply.userImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={reply.userImage}
                  alt={reply.userName}
                  className="size-5 sm:size-6 rounded-full border border-border shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="size-5 sm:size-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <span className="text-[10px]">{reply.userName[0]}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{reply.userName}</span>
                  {reply.userRole === "admin" && (
                    <Badge variant="outline" className="text-[10px] h-3.5 px-1">
                      Admin
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {formatDate(reply.createdAt)}
                  </span>
                </div>
                <p className="text-xs mt-0.5 whitespace-pre-line">
                  {reply.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  return new Date(timestamp).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}
