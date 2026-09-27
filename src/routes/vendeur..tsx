import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/vendeur/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/vendeur/"!</div>
}
