'use client';

import Link from 'next/link';
import { ArrowLeft, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/**
 * Direct organization creation has been replaced by the launchpad. An
 * Organization is now created automatically once its backing funding project
 * meets its goal and activates.
 */
export default function NewOrganizationPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href="/organizations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to organizations
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Organizations are created via the launchpad</CardTitle>
          <CardDescription>
            VoteChain is now a DAO launchpad. Instead of creating an organization directly, you
            launch a funding project. When it reaches its goal on-chain, its DAO activates,
            membership is minted to contributors, and governance opens automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Rocket className="h-6 w-6" />
          </span>
          <Link href="/projects/new">
            <Button size="lg">
              <Rocket className="h-4 w-4" /> Launch a project
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
