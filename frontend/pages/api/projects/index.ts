import type { NextApiRequest, NextApiResponse } from "next";
import { loadProjects } from "@/lib/projects";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  // Cached at the edge for a minute; force-revalidates on deploy.
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=600",
  );
  res.status(200).json({ projects: loadProjects() });
}
