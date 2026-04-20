import staticCustomerSessions from '@/data/customer-sessions.json'
import CustomersClient from './CustomersClient'

export default function CustomersPage() {
  // Use static JSON data directly — no Airtable call needed for this page.
  // The client component handles all filtering, extraction, and rendering.
  return <CustomersClient records={staticCustomerSessions} />
}
