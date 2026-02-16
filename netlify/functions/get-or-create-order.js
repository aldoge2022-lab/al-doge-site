const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  try {
    const tableNumber = event.queryStringParameters?.table

    if (!tableNumber) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing table number' })
      }
    }

    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select('*')
      .eq('numero', tableNumber)
      .single()

    if (tableError || !table) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Table not found' })
      }
    }

    const { data: existingOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('table_id', table.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingOrder) {
      return {
        statusCode: 200,
        body: JSON.stringify(existingOrder)
      }
    }

    const { data: newOrder, error: orderError } = await supabase
      .from('orders')
      .insert([{ table_id: table.id }])
      .select()
      .single()

    if (orderError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Order creation failed' })
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify(newOrder)
    }

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error' })
    }
  }
}
