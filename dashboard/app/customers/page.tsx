export const dynamic = 'force-dynamic'

import staticCustomerSessions from '@/data/customer-sessions.json'
import CustomersClient from './CustomersClient'

export default function CustomersPage() {
  const totalCustomers = (staticCustomerSessions as unknown[]).length
  return <CustomersClient totalCustomers={totalCustomers} />
}
