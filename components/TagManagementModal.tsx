"use client";

import { useState, useEffect } from "react";
import { X, Tag as TagIcon, Plus, Check } from "lucide-react";

interface Tag {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  _count?: {
    contacts: number;
  };
}

interface ContactTag {
  tag: {
    id: string;
    name: string;
    color: string | null;
  };
}

interface TagManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  currentTags: ContactTag[];
  onTagsUpdated: (tags: ContactTag[]) => void;
}

export function TagManagementModal({
  isOpen,
  onClose,
  contactId,
  contactName,
  currentTags,
  onTagsUpdated,
}: TagManagementModalProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [assignedTagIds, setAssignedTagIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTags();
      setAssignedTagIds(new Set(currentTags.map(ct => ct.tag.id)));
    }
  }, [isOpen, currentTags]);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tags");
      const data = await response.json();
      setAllTags(data.tags || []);
    } catch (error) {
      console.error("Error fetching tags:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = async (tagId: string) => {
    const isAssigned = assignedTagIds.has(tagId);
    setUpdating(tagId);

    try {
      if (isAssigned) {
        // Remove tag
        const response = await fetch(`/api/contacts/${contactId}/tags?tagId=${tagId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Failed to remove tag");
        }

        // Update local state
        const newAssignedIds = new Set(assignedTagIds);
        newAssignedIds.delete(tagId);
        setAssignedTagIds(newAssignedIds);

        // Update parent component
        const newTags = currentTags.filter(ct => ct.tag.id !== tagId);
        onTagsUpdated(newTags);
      } else {
        // Add tag
        const response = await fetch(`/api/contacts/${contactId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to add tag");
        }

        const data = await response.json();

        // Update local state
        const newAssignedIds = new Set(assignedTagIds);
        newAssignedIds.add(tagId);
        setAssignedTagIds(newAssignedIds);

        // Update parent component
        const newTags = [...currentTags, { tag: data.contactTag.tag }];
        onTagsUpdated(newTags);
      }
    } catch (error) {
      console.error("Error toggling tag:", error);
      alert(error instanceof Error ? error.message : "Failed to update tag");
    } finally {
      setUpdating(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <TagIcon className="h-5 w-5 text-[#0088cc]" />
            <h2 className="text-lg font-semibold text-gray-900">Manage Tags</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Contact Info */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-sm text-gray-600">
            Managing tags for <span className="font-medium text-gray-900">{contactName}</span>
          </p>
        </div>

        {/* Tags List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-3 border-solid border-[#0088cc] border-r-transparent"></div>
            </div>
          ) : allTags.length === 0 ? (
            <div className="text-center py-8">
              <TagIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No tags available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allTags.map((tag) => {
                const isAssigned = assignedTagIds.has(tag.id);
                const isUpdating = updating === tag.id;

                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    disabled={isUpdating}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                      isAssigned
                        ? "border-[#0088cc] bg-blue-50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    } ${isUpdating ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="h-4 w-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color || "#6b7280" }}
                      />
                      <div className="text-left min-w-0 flex-1">
                        <div className="font-medium text-sm text-gray-900 truncate">
                          {tag.name}
                        </div>
                        {tag.description && (
                          <div className="text-xs text-gray-500 truncate">
                            {tag.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {tag._count && (
                        <span className="text-xs text-gray-500">
                          {tag._count.contacts}
                        </span>
                      )}
                      {isUpdating ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-[#0088cc] border-r-transparent"></div>
                      ) : isAssigned ? (
                        <div className="h-5 w-5 rounded-full bg-[#0088cc] flex items-center justify-center">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300 flex items-center justify-center">
                          <Plus className="h-3 w-3 text-gray-400" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-[#0088cc] text-white rounded-lg hover:bg-[#006699] transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
