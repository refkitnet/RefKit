"use client";

import {
  DollarSign,
  MousePointerClick,
  Percent,
  UserCheck,
  Users,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { UserDisplay } from "@/components/dashboard/user-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatMoney,
  formatPercent,
  type ProgramOverview,
} from "@/lib/dashboard-types";

export function ProgramOverviewCards({
  overview,
  showTopAffiliates = true,
  showConversionRates = true,
}: {
  overview: ProgramOverview;
  showTopAffiliates?: boolean;
  showConversionRates?: boolean;
}) {
  const currency = overview.gross_referred_revenue.currency;

  return (
    <div className="flex flex-col gap-5">
      <div
        className={`grid gap-4 sm:grid-cols-2 ${
          showConversionRates ? "lg:grid-cols-3" : "lg:grid-cols-4"
        }`}
      >
        <MetricCard
          title="Clicks"
          value={String(overview.clicks)}
          icon={MousePointerClick}
        />
        <MetricCard
          title="Referrals"
          value={String(overview.referrals)}
          icon={UserCheck}
        />
        <MetricCard
          title="Paying"
          value={String(overview.paying_customers)}
          icon={Users}
        />
        <MetricCard
          title="Revenue"
          value={formatMoney(
            overview.gross_referred_revenue.amount,
            currency
          )}
          icon={DollarSign}
        />
        {showConversionRates ? (
          <>
            <MetricCard
              title="Click to signup"
              value={formatPercent(overview.click_to_referral_rate)}
              icon={Percent}
            />
            <MetricCard
              title="Signup to paid"
              value={formatPercent(overview.referral_to_paid_rate)}
              icon={Percent}
            />
          </>
        ) : null}
      </div>

      {showTopAffiliates ? (
        <Card className="gap-4 border-border/70 py-5">
          <CardHeader className="px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-muted-foreground/70" />
              Top affiliates
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            {overview.top_affiliates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No referred revenue yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Affiliate</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.top_affiliates.map((affiliate) => (
                    <TableRow key={affiliate.program_affiliate_id}>
                      <TableCell>
                        <UserDisplay
                          id={affiliate.program_affiliate_id}
                          name={affiliate.name}
                          email={affiliate.email}
                          image={affiliate.image}
                          link_code={affiliate.default_link_code}
                        />
                      </TableCell>
                      <TableCell>{affiliate.default_link_code}</TableCell>
                      <TableCell>
                        {formatMoney(
                          affiliate.gross_revenue.amount,
                          affiliate.gross_revenue.currency
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
