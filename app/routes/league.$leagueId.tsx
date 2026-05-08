import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/league/$leagueId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/league/$leagueId"!</div>
}
