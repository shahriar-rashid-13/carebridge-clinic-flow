// import { supabase } from "./client";

// export async function testSupabaseConnection() {
//   const { data, error } = await supabase
//     .from("doctors")
//     .select("*");

//   if (error) {
//     console.error("Supabase connection failed:", error);
//     return;
//   }

//   console.log("Supabase connection successful!");
//   console.log("Doctors:", data);
// }