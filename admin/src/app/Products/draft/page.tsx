"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DraftProductsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Draft Products</h1>
        <Button asChild variant="outline">
          <Link href="/Products">Back to Products</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-white p-6 text-gray-600">
        This is a placeholder for draft products. Add your content here.
      </div>
    </div>
  );
}

