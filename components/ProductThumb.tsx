import React, { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { getImageUrl } from "@/helper/imageDB";
import { Product } from "../types";

type Props = {
    product: Product;
    className?: string;
};

export const ProductThumb: React.FC<Props> = ({ product, className }) => {
    const [src, setSrc] = useState<string>("");

    useEffect(() => {
        let alive = true;
        let lastObjectUrl: string | null = null;

        const load = async () => {
            if (product.image) {
                setSrc(product.image);
                return;
            }

            if (product.imageId) {
                const url = await getImageUrl(product.imageId);
                if (!alive) return;

                if (url) {
                    lastObjectUrl = url;
                    setSrc(url);
                } else {
                    setSrc("");
                }
            } else {
                setSrc("");
            }
        };

        load();

        return () => {
            alive = false;
            if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
        };
    }, [product.image, product.imageId]);

    return (
        <div className="w-full h-full relative flex items-center justify-center">

            <img
                src={src || ""}
                alt={product.name}
                data-imgid={product.imageId ?? ""}
                className={className ?? "w-full h-full object-contain block"}
            />

            {!src && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                    <ImageIcon className="w-6 h-6" />
                </div>
            )}
        </div>
    );
};

