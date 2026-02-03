import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";


import { Table as TableIcon, Rows, Columns, Trash2 } from "lucide-react";

type Props = {
    value: string;              // HTML
    onChange: (html: string) => void;
    placeholder?: string;
};

export const RichTextEditor: React.FC<Props> = ({ value, onChange, placeholder }) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: value || "",
        editorProps: {
            attributes: {
                class:
                    "min-h-[96px] w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 prose prose-sm max-w-none",
                "data-placeholder": placeholder ?? "Descripción (opcional)",
            },
        },
        onUpdate({ editor }) {
            onChange(editor.getHTML());
        },
    });

    if (!editor) return null;

    const Btn = ({
        onClick,
        active,
        children,
        title,
    }: {
        onClick: () => void;
        active?: boolean;
        children: React.ReactNode;
        title: string;
    }) => (
        <button
            type="button"
            title={title}
            onClick={onClick}
            className={`p-2 rounded-lg border text-slate-600 hover:bg-slate-50 ${active ? "bg-blue-50 border-blue-200 text-blue-700" : "border-slate-200"
                }`}
        >
            {children}
        </button>
    );

    return (
        <div className="space-y-2">

            <div className="flex flex-wrap gap-2">
                {/* TEXTO */}
                <Btn
                    title="Negrita"
                    active={editor.isActive("bold")}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                >
                    <Bold className="w-4 h-4" />
                </Btn>

                <Btn
                    title="Cursiva"
                    active={editor.isActive("italic")}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                    <Italic className="w-4 h-4" />
                </Btn>

                {/* LISTAS */}
                <Btn
                    title="Lista con bullets"
                    active={editor.isActive("bulletList")}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                >
                    <List className="w-4 h-4" />
                </Btn>

                <Btn
                    title="Lista numerada"
                    active={editor.isActive("orderedList")}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                >
                    <ListOrdered className="w-4 h-4" />
                </Btn>

                {/* SEPARADOR VISUAL */}
                <div className="w-px h-6 bg-slate-200 mx-1" />

                {/* TABLAS */}
                <Btn
                    title="Insertar tabla"
                    onClick={() =>
                        editor
                            .chain()
                            .focus()
                            .insertTable({ rows: 4, cols: 3, withHeaderRow: true })
                            .run()
                    }
                >
                    <TableIcon className="w-4 h-4" />
                </Btn>

                <Btn
                    title="Agregar fila"
                    onClick={() => editor.chain().focus().addRowAfter().run()}
                >
                    <Rows className="w-4 h-4" />
                </Btn>

                <Btn
                    title="Agregar columna"
                    onClick={() => editor.chain().focus().addColumnAfter().run()}
                >
                    <Columns className="w-4 h-4" />
                </Btn>

                <Btn
                    title="Eliminar tabla"
                    onClick={() => editor.chain().focus().deleteTable().run()}
                >
                    <Trash2 className="w-4 h-4" />
                </Btn>
            </div>

            <div className="bg-white rounded-xl">
                <EditorContent editor={editor} />
            </div>

            <style>{`
            .ProseMirror:focus { outline: none; }

            .ProseMirror ul {
                list-style-type: disc;
                padding-left: 1.25rem;
                margin: 0.5rem 0;
            }

            .ProseMirror ol {
                list-style-type: decimal;
                padding-left: 1.25rem;
                margin: 0.5rem 0;
            }

            .ProseMirror li {
                margin: 0.125rem 0;
            }

            /* placeholder */
            .ProseMirror p.is-editor-empty:first-child::before {
                content: attr(data-placeholder);
                float: left;
                color: #94a3b8;
                pointer-events: none;
                height: 0;
            }
           .ProseMirror table {
            width: 100%;
            border-collapse: collapse;
            margin: 0.5rem 0;
            }

            .ProseMirror th,
            .ProseMirror td {
            border: 1px solid #e5e7eb;
            padding: 6px 8px;
            text-align: left;
            }

            .ProseMirror th {
            background: #f97316;
            color: white;
            font-weight: 700;
            }

            `}</style>
        </div>
    );
};
