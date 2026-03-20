import React, { useEffect, useState } from 'react';
import Loading from '../components/Loading';
import BlurCircle from '../components/BlurCircle';
import timeFormat from '../lib/timeFormat';
import { dateFormat } from '../lib/dateFormate';
import { useAppContext } from '../context/AppContext';
import { Calendar, Clock, ChevronRight, CreditCard } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const MyBookings = () => {
  const { axios, user, image_base_url, getToken } = useAppContext();
  const currency = import.meta.env.VITE_CURRENCY;
  const location = useLocation();

  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ Fetch bookings from backend
  const getMyBookings = async () => {
    try {
      setIsLoading(true);
      const token = await getToken();
      const { data } = await axios.get('/api/booking/user-bookings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) setBookings(data.bookings);
    } catch (error) {
      console.log(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load bookings on user login
  useEffect(() => {
    if (user) getMyBookings();
  }, [user]);

  // Refresh bookings after Stripe redirect
  useEffect(() => {
    if (location.search.includes('success=true') && user) {
      getMyBookings();
    }
  }, [location, user]);

  if (isLoading) return <Loading />;

  return (
    <div className='relative px-6 md:px-16 lg:px-40 pt-32 pb-20 min-h-screen bg-[#020202] text-white selection:bg-primary/30'>
      <BlurCircle top='5%' left='-2%' color="bg-primary" opacity="opacity-10" />
      <div className='max-w-4xl mx-auto relative z-10'>
        <header className='flex items-center gap-4 mb-12 group'>
          <div className='h-8 w-1.5 bg-primary rounded-full shadow-[0_0_20px_rgba(var(--primary-rgb),0.6)] group-hover:h-10 transition-all duration-500' />
          <h1 className='text-2xl md:text-3xl font-black uppercase tracking-[0.2em] italic text-white/90'>
            Vault <span className='text-primary/80'>Bookings</span>
          </h1>
        </header>

        <div className='grid gap-6'>
          {bookings.map((item, index) => (
            <div key={index} className='group relative flex flex-col md:flex-row bg-white/[0.01] border border-white/5 rounded-2xl overflow-hidden hover:bg-white/[0.03] hover:border-primary/20 hover:shadow-[0_0_40px_rgba(0,0,0,0.5)] transition-all duration-500 cursor-pointer'>
              
              {/* Poster Section */}
              <div className='relative md:w-48 shrink-0 overflow-hidden'>
                <img
                  src={image_base_url + item.show.movie.poster_path}
                  alt={item.show.movie.title}
                  className='w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700 ease-out'
                />
                <div className='absolute inset-0 bg-gradient-to-t from-[#020202] via-transparent to-transparent' />
                <div className='absolute top-3 left-3 px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest backdrop-blur-xl bg-primary/20 border border-primary/30 text-primary shadow-lg'>
                  {item.isPaid ? 'Active' : 'Draft'}
                </div>
              </div>

              {/* Info Section */}
              <div className='flex-1 flex flex-col p-6 relative z-10'>
                <div className='flex justify-between items-start'>
                  <div>
                    <h2 className='text-xl font-black uppercase tracking-tight text-white/90 group-hover:text-primary transition-colors duration-300'>
                      {item.show.movie.title}
                    </h2>
                    <div className='flex items-center gap-4 mt-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest'>
                      <span className='flex items-center gap-1.5'><Clock className='w-3.5 h-3.5 text-primary/60'/> {timeFormat(item.show.movie.runtime)}</span>
                      <span className='flex items-center gap-1.5'><Calendar className='w-3.5 h-3.5 text-primary/60'/> {dateFormat(item.show.showDateTime)}</span>
                    </div>
                  </div>

                  <div className='text-right'>
                    <p className='text-2xl font-black text-white tracking-tighter group-hover:scale-110 transition-transform'>
                      {currency}{item.amount}
                    </p>
                    <p className='text-[9px] font-bold text-gray-600 uppercase mt-1 tracking-[0.2em]'>Secured</p>
                  </div>
                </div>

                {/* Tickets & Pay Button */}
                <div className='mt-auto pt-6 border-t border-white/5 flex items-center justify-between'>
                  <div className='flex gap-8'>
                    <div className='group/label'>
                      <p className='text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1 group-hover/label:text-primary transition-colors'>Tickets</p>
                      <p className='text-md font-black italic'>{item.bookedSeats.length < 10 ? `0${item.bookedSeats.length}` : item.bookedSeats.length}</p>
                    </div>
                    <div className='group/label'>
                      <p className='text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1 group-hover/label:text-primary transition-colors'>Seat No.</p>
                      <div className='flex gap-1'>
                        {item.bookedSeats.map(seat => (
                          <span key={seat} className='text-sm font-black text-primary/80 group-hover:text-white transition-colors'>{seat}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Pay Now / Active */}
                  {!item.isPaid && item.paymentLink ? (
                    <Link to={item.paymentLink} className='flex items-center gap-2 bg-primary text-black px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:shadow-[0_0_20px_rgba(var(--primary-rgb),0.4)] hover:-translate-y-0.5 active:translate-y-0 transition-all'>
                      <CreditCard className='w-3.5 h-3.5' /> Pay Now
                    </Link>
                  ) : (
                    <div className='w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all duration-500 shadow-inner'>
                      <ChevronRight className='w-5 h-5 text-gray-500 group-hover:text-black transition-colors' />
                    </div>
                  )}
                </div>

              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MyBookings;