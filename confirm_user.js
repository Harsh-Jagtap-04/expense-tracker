process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { createClient } = require('@supabase/supabase-js');
const url = 'https://pwyydcndisfslecxyrgy.supabase.co';
const service_key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_KEY';

const supabase = createClient(url, service_key);

async function confirm() {
  const emailToConfirm = process.argv[2] || 'test.account@gmail.com';
  
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) return console.error(listError);
  
  const testUser = users.users.find(u => u.email === emailToConfirm);
  if (testUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(testUser.id, { 
      email_confirm: true,
      password: 'password123'
    });
    console.log(`User ${emailToConfirm} confirmed and password reset to 'password123':`, error ? error : 'Success');
  } else {
    console.log(`User ${emailToConfirm} not found`);
  }
}
confirm();
